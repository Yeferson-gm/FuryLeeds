import { and, count, eq, exists, sql } from 'drizzle-orm';
import { findOrCreateContact } from '@/lib/api/v1/contacts';
import { type db as appDb, schema } from '@/lib/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  parseInternationalPhone,
  phoneVariants,
} from '@/lib/whatsapp/phone-utils';
import { resolveTemplateRow } from '@/lib/whatsapp/template-body';
import type { MessageTemplate } from '@/types';

export class BroadcastError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BroadcastError';
    this.code = code;
    this.status = status;
  }
}

export interface CreateBroadcastParams {
  name?: string | null;
  templateName: string;
  templateLanguage?: string | null;
  recipients: { to: string; params?: unknown[] }[];
}

interface PlannedRecipient {
  recipientRowId: string;
  phone: string;
  params: string[];
}

export interface BroadcastPlan {
  accountId: string;
  broadcastId: string;
  templateName: string;
  templateLanguage: string;
  phoneNumberId: string;
  accessToken: string;
  templateRow: MessageTemplate | null;
  planned: PlannedRecipient[];
  rejected: number;
}

const MAX_RECIPIENTS = 1000;

export async function createBroadcast(
  database: typeof appDb,
  accountId: string,
  auditUserId: string,
  params: CreateBroadcastParams
): Promise<BroadcastPlan> {
  if (!params.templateName) {
    throw new BroadcastError('bad_request', "'template_name' is required", 400);
  }
  if (params.recipients.length === 0) {
    throw new BroadcastError(
      'bad_request',
      "'recipients' must be a non-empty array of { to, params? }",
      400
    );
  }
  if (params.recipients.length > MAX_RECIPIENTS) {
    throw new BroadcastError(
      'bad_request',
      `A broadcast is capped at ${MAX_RECIPIENTS} recipients per request; split larger sends`,
      400
    );
  }

  const [config] = await database
    .select({
      phoneNumberId: schema.whatsappConfig.phoneNumberId,
      accessToken: schema.whatsappConfig.accessToken,
    })
    .from(schema.whatsappConfig)
    .where(eq(schema.whatsappConfig.accountId, accountId))
    .limit(1);
  if (!config) {
    throw new BroadcastError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }
  const accessToken = decrypt(config.accessToken);
  const resolvedTemplate = await resolveTemplateRow(
    database,
    accountId,
    params.templateName,
    params.templateLanguage
  );
  if (resolvedTemplate.malformed) {
    throw new BroadcastError(
      'template_malformed',
      'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.',
      500
    );
  }

  const valid: { phone: string; params: string[]; rawPhone: string }[] = [];
  let rejected = 0;
  for (const recipient of params.recipients) {
    const phone = parseInternationalPhone(recipient.to);
    if (!phone) {
      rejected++;
      continue;
    }
    valid.push({
      phone,
      rawPhone: recipient.to,
      params: Array.isArray(recipient.params)
        ? recipient.params.filter(
            (value): value is string => typeof value === 'string'
          )
        : [],
    });
  }
  if (valid.length === 0) {
    throw new BroadcastError(
      'bad_request',
      'No recipients had a valid international phone number (leading + and country code, e.g. +14155550123)',
      400
    );
  }

  try {
    const persisted = await database.transaction(async (tx) => {
      const resolved: Array<{
        contactId: string;
        phone: string;
        params: string[];
      }> = [];
      for (const recipient of valid) {
        const contact = await findOrCreateContact(tx, accountId, auditUserId, {
          phone: recipient.rawPhone,
        });
        resolved.push({
          contactId: contact.id,
          phone: recipient.phone,
          params: recipient.params,
        });
      }
      const deduped = [
        ...new Map(resolved.map((row) => [row.contactId, row])).values(),
      ];
      const [broadcast] = await tx
        .insert(schema.broadcasts)
        .values({
          accountId,
          userId: auditUserId,
          name: params.name || `API broadcast (${params.templateName})`,
          templateName: params.templateName,
          templateLanguage: resolvedTemplate.language,
          status: 'sending',
          totalRecipients: deduped.length,
        })
        .returning({ id: schema.broadcasts.id });
      if (!broadcast) throw new Error('Broadcast insert returned no row');
      const recipients = await tx
        .insert(schema.broadcastRecipients)
        .values(
          deduped.map((recipient) => ({
            broadcastId: broadcast.id,
            contactId: recipient.contactId,
            status: 'pending',
            templateParams: recipient.params,
          }))
        )
        .returning({
          id: schema.broadcastRecipients.id,
          contactId: schema.broadcastRecipients.contactId,
        });
      const byContact = new Map(deduped.map((row) => [row.contactId, row]));
      return {
        broadcastId: broadcast.id,
        planned: recipients.map((row) => {
          const recipient = row.contactId ? byContact.get(row.contactId) : null;
          if (!recipient) throw new Error('Recipient insert mismatch');
          return {
            recipientRowId: row.id,
            phone: recipient.phone,
            params: recipient.params,
          };
        }),
      };
    });

    return {
      accountId,
      broadcastId: persisted.broadcastId,
      templateName: params.templateName,
      templateLanguage: resolvedTemplate.language,
      phoneNumberId: config.phoneNumberId,
      accessToken,
      templateRow: resolvedTemplate.row,
      planned: persisted.planned,
      rejected,
    };
  } catch (error) {
    console.error('[api/v1/broadcasts] create error:', error);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }
}

function recipientOwnedByAccount(database: typeof appDb, accountId: string) {
  return exists(
    database
      .select({ id: schema.broadcasts.id })
      .from(schema.broadcasts)
      .where(
        and(
          eq(schema.broadcasts.id, schema.broadcastRecipients.broadcastId),
          eq(schema.broadcasts.accountId, accountId)
        )
      )
  );
}

export async function deliverBroadcast(
  database: typeof appDb,
  plan: BroadcastPlan
): Promise<void> {
  for (const recipient of plan.planned) {
    let sentMessageId: string | null = null;
    let lastError: string | null = null;
    for (const variant of phoneVariants(recipient.phone)) {
      try {
        sentMessageId = (
          await sendTemplateMessage({
            phoneNumberId: plan.phoneNumberId,
            accessToken: plan.accessToken,
            to: variant,
            templateName: plan.templateName,
            language: plan.templateLanguage,
            template: plan.templateRow ?? undefined,
            bodyParams: recipient.params,
          })
        ).messageId;
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        if (!isRecipientNotAllowedError(lastError)) break;
      }
    }

    await database
      .update(schema.broadcastRecipients)
      .set(
        sentMessageId
          ? {
              status: 'sent',
              sentAt: sql`now()`,
              whatsappMessageId: sentMessageId,
              errorMessage: null,
            }
          : {
              status: 'failed',
              errorMessage: lastError || 'Unknown error',
            }
      )
      .where(
        and(
          eq(schema.broadcastRecipients.id, recipient.recipientRowId),
          recipientOwnedByAccount(database, plan.accountId)
        )
      );
  }
  await finalizeBroadcastStatus(database, plan.accountId, plan.broadcastId);
}

export async function finalizeBroadcastStatus(
  database: typeof appDb,
  accountId: string,
  broadcastId: string
): Promise<void> {
  await database.transaction(async (tx) => {
    const counts = await tx
      .select({
        status: schema.broadcastRecipients.status,
        value: count(),
      })
      .from(schema.broadcastRecipients)
      .innerJoin(
        schema.broadcasts,
        and(
          eq(schema.broadcasts.id, schema.broadcastRecipients.broadcastId),
          eq(schema.broadcasts.accountId, accountId)
        )
      )
      .where(eq(schema.broadcastRecipients.broadcastId, broadcastId))
      .groupBy(schema.broadcastRecipients.status);
    const byStatus = new Map(counts.map((row) => [row.status, row.value]));
    if ((byStatus.get('pending') ?? 0) > 0) return;
    const total = [...byStatus.values()].reduce((sum, value) => sum + value, 0);
    const failed = byStatus.get('failed') ?? 0;
    await tx
      .update(schema.broadcasts)
      .set({
        status: failed > 0 && failed === total ? 'failed' : 'sent',
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.broadcasts.id, broadcastId),
          eq(schema.broadcasts.accountId, accountId)
        )
      );
  });
}
