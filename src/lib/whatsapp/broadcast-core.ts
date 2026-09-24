// ============================================================
// Public-API broadcast core.
//
// Splits a broadcast into two phases so the HTTP route can persist +
// acknowledge fast and fan out afterwards (in `after()`):
//
//   createBroadcast()  — validate, resolve contacts, insert the
//                        `broadcasts` row + `broadcast_recipients`
//                        rows (status 'pending'), return a plan.
//   deliverBroadcast() — send each recipient's template via Meta
//                        (phone-variant retry), stamp each recipient
//                        row + the aggregate counts, finalize status.
//
// Recipient rows carry `whatsapp_message_id`, so the inbound webhook's
// status handler (which matches on that column) updates delivered/read
// for API broadcasts exactly as it does for dashboard ones.
// ============================================================

import { and, count, eq } from 'drizzle-orm';
import { schema } from '@/lib/db';
import {
  findOrCreateContact,
  type WhatsAppDb,
  type WhatsAppQueryDb,
} from '@/lib/whatsapp/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  parseInternationalPhone,
  phoneVariants,
} from '@/lib/whatsapp/phone-utils';
import { resolveTemplateRow } from '@/lib/whatsapp/template-body';
import type { MessageTemplate } from '@/types';

/** Thrown by createBroadcast on a caller-visible failure; route maps it. */
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

export interface BroadcastRecipientInput {
  /** E.164 phone. */
  to: string;
  /** Positional body params for the template ({{1}}, {{2}}…). */
  params?: string[];
}

export interface CreateBroadcastParams {
  name?: string | null;
  templateName: string;
  templateLanguage?: string | null;
  recipients: BroadcastRecipientInput[];
}

interface PlannedRecipient {
  recipientRowId: string;
  phone: string;
  params: string[];
}

export interface BroadcastPlan {
  broadcastId: string;
  templateName: string;
  templateLanguage: string;
  phoneNumberId: string;
  accessToken: string;
  templateRow: MessageTemplate | null;
  planned: PlannedRecipient[];
  /** Phones rejected up front (invalid E.164) — counted as failed. */
  rejected: number;
}

const MAX_RECIPIENTS = 1000;

/**
 * Validate + persist a broadcast, resolving each recipient to a
 * contact. Returns a plan for {@link deliverBroadcast}. Throws
 * {@link BroadcastError} on bad input / missing config / a malformed
 * template / a DB failure — nothing is sent in this phase.
 */
export async function createBroadcast(
  db: WhatsAppDb,
  accountId: string,
  auditUserId: string,
  params: CreateBroadcastParams
): Promise<BroadcastPlan> {
  const { name, templateName, recipients } = params;

  if (!templateName) {
    throw new BroadcastError('bad_request', "'template_name' is required", 400);
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new BroadcastError(
      'bad_request',
      "'recipients' must be a non-empty array of { to, params? }",
      400
    );
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new BroadcastError(
      'bad_request',
      `A broadcast is capped at ${MAX_RECIPIENTS} recipients per request; split larger sends`,
      400
    );
  }

  // Config (fail fast + provides the audit trail owner already resolved
  // by the caller). Meta send needs phone_number_id + decrypted token.
  const [config] = await db
    .select()
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

  // Template row (once) for header/button components; guard a
  // malformed local row rather than N identical opaque failures.
  const resolvedTemplate = await resolveTemplateRow(
    db,
    accountId,
    templateName,
    params.templateLanguage
  );
  if (resolvedTemplate.malformed) {
    throw new BroadcastError(
      'template_malformed',
      'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.',
      500
    );
  }
  const templateRow = resolvedTemplate.row;

  // Resolve each recipient to a contact. Invalid phones are dropped
  // (counted as rejected) rather than aborting the whole broadcast.
  // `to` is raw integrator input, so the leading `+` is required — a
  // national-format number would otherwise be delivered to whichever
  // country its leading digits spell (issue #586).
  const resolved: { contactId: string; phone: string; params: string[] }[] = [];
  let rejected = 0;
  for (const r of recipients) {
    const to = typeof r.to === 'string' ? r.to : '';
    const sanitized = parseInternationalPhone(to);
    if (!sanitized) {
      rejected++;
      continue;
    }
    const { id } = await findOrCreateContact(
      db,
      accountId,
      auditUserId,
      sanitized
    );
    resolved.push({
      contactId: id,
      phone: sanitized,
      params: Array.isArray(r.params)
        ? r.params.filter((p): p is string => typeof p === 'string')
        : [],
    });
  }

  // Collapse recipients that resolved to the SAME contact (the caller
  // listed a phone twice, or two numbers fuzzy-matched to one contact).
  // Keep the first occurrence so the contact is messaged once and its
  // params aren't silently overwritten by a later duplicate — and so
  // the row↔params pairing below (keyed by contact_id) is unambiguous.
  const seenContact = new Set<string>();
  const deduped = resolved.filter((r) => {
    if (seenContact.has(r.contactId)) return false;
    seenContact.add(r.contactId);
    return true;
  });

  if (deduped.length === 0) {
    throw new BroadcastError(
      'bad_request',
      'No recipients had a valid international phone number (leading + and country code, e.g. +14155550123)',
      400
    );
  }

  let createdRows: { recipientId: string; contactId: string }[];
  let broadcastId: string;
  try {
    ({ broadcastId, recipients: createdRows } = await db.transaction(
      async (tx) => {
        const [broadcast] = await tx
          .insert(schema.broadcasts)
          .values({
            accountId,
            userId: auditUserId,
            name: name || `API broadcast (${templateName})`,
            templateName,
            templateLanguage: resolvedTemplate.language,
            totalRecipients: deduped.length,
            status: 'sending',
          })
          .returning({ id: schema.broadcasts.id });
        if (!broadcast) throw new Error('Broadcast insert returned no row');

        const recipientRows = await tx
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
            recipientId: schema.broadcastRecipients.id,
            contactId: schema.broadcastRecipients.contactId,
          });

        if (recipientRows.length !== deduped.length) {
          throw new Error('Not all broadcast recipients were created');
        }
        return {
          broadcastId: broadcast.id,
          recipients: recipientRows.map((row) => ({
            recipientId: row.recipientId,
            contactId: row.contactId as string,
          })),
        };
      }
    ));
  } catch (error) {
    console.error('[broadcast-core] create broadcast error:', error);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }

  // Pair each inserted recipient row back to its phone/params by
  // contact_id — unambiguous now that duplicates are collapsed.
  const byContact = new Map(deduped.map((r) => [r.contactId, r]));
  const planned: PlannedRecipient[] = createdRows.map((row) => {
    const recipient = byContact.get(row.contactId);
    if (!recipient) {
      throw new BroadcastError(
        'internal',
        'Created recipient does not match the broadcast audience',
        500
      );
    }
    return {
      recipientRowId: row.recipientId,
      phone: recipient.phone,
      params: recipient.params,
    };
  });

  return {
    broadcastId,
    templateName,
    templateLanguage: resolvedTemplate.language,
    phoneNumberId: config.phoneNumberId,
    accessToken,
    templateRow,
    planned,
    rejected,
  };
}

/**
 * Fan out a {@link BroadcastPlan}: send each recipient's template
 * (phone-variant retry) and stamp its `broadcast_recipients` row.
 * Best-effort per recipient — one failure never aborts the rest.
 * Designed to run inside `after()`.
 *
 * The per-status count columns on `broadcasts` are owned by the DB
 * aggregate trigger (migrations 003/005): each recipient-row update
 * below advances them automatically, and later Meta delivery/read
 * webhooks keep advancing them. We therefore never write those columns
 * here — only the terminal `status` — otherwise a manual value would
 * race and clobber the trigger-maintained counts.
 */
export async function deliverBroadcast(
  db: WhatsAppQueryDb,
  plan: BroadcastPlan
): Promise<void> {
  for (const recipient of plan.planned) {
    const variants = phoneVariants(recipient.phone);
    let sentMessageId: string | null = null;
    let lastError: string | null = null;

    for (const variant of variants) {
      try {
        const result = await sendTemplateMessage({
          phoneNumberId: plan.phoneNumberId,
          accessToken: plan.accessToken,
          to: variant,
          templateName: plan.templateName,
          language: plan.templateLanguage,
          template: plan.templateRow ?? undefined,
          bodyParams: recipient.params,
        });
        sentMessageId = result.messageId;
        lastError = null;
        break;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        lastError = message;
        // Only a "recipient not allowed" error is worth another variant.
        if (!isRecipientNotAllowedError(message)) break;
      }
    }

    if (sentMessageId) {
      await db
        .update(schema.broadcastRecipients)
        .set({
          status: 'sent',
          sentAt: new Date().toISOString(),
          whatsappMessageId: sentMessageId,
          errorMessage: null,
        })
        .where(eq(schema.broadcastRecipients.id, recipient.recipientRowId));
    } else {
      await db
        .update(schema.broadcastRecipients)
        .set({
          status: 'failed',
          errorMessage: lastError || 'Unknown error',
        })
        .where(eq(schema.broadcastRecipients.id, recipient.recipientRowId));
    }
  }

  await finalizeBroadcastStatus(db, plan.broadcastId);
}

/**
 * Flip a broadcast out of `sending` once no recipient is left pending.
 *
 * Derived from the recipient rows rather than from a counter local to
 * one delivery pass: a resume (issue #472) delivers only the leftovers,
 * so "nothing sent *this* pass" must not mark a campaign failed when
 * 800 of its 1 000 recipients went out earlier. `failed` means every
 * single recipient failed; anything else that reached Meta is `sent`,
 * with the per-recipient failures visible in `failed_count`.
 *
 * Per-status counts stay trigger-owned (migrations 003/005) — only the
 * terminal `status` is written here.
 */
export async function finalizeBroadcastStatus(
  db: WhatsAppQueryDb,
  broadcastId: string
): Promise<void> {
  const countWhere = async (status: string): Promise<number> => {
    const [row] = await db
      .select({ value: count() })
      .from(schema.broadcastRecipients)
      .where(
        and(
          eq(schema.broadcastRecipients.broadcastId, broadcastId),
          eq(schema.broadcastRecipients.status, status)
        )
      );
    return row?.value ?? 0;
  };

  // Still work outstanding (a capped resume pass) — leave it 'sending'
  // so the UI keeps offering Resume.
  if ((await countWhere('pending')) > 0) return;

  const [failed, [totalRow]] = await Promise.all([
    countWhere('failed'),
    db
      .select({ value: count() })
      .from(schema.broadcastRecipients)
      .where(eq(schema.broadcastRecipients.broadcastId, broadcastId)),
  ]);
  const total = totalRow?.value ?? 0;

  await db
    .update(schema.broadcasts)
    .set({
      status: failed > 0 && failed === total ? 'failed' : 'sent',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.broadcasts.id, broadcastId));
}
