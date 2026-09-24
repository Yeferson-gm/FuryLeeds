import { and, asc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { schema } from '@/lib/db';
import {
  BroadcastError,
  type BroadcastPlan,
} from '@/lib/whatsapp/broadcast-core';
import type { WhatsAppQueryDb } from '@/lib/whatsapp/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import { isValidE164, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';
import { resolveTemplateRow } from '@/lib/whatsapp/template-body';

export type ResumeScope = 'pending' | 'failed' | 'all';
export const RESUME_SCOPES: readonly ResumeScope[] = [
  'pending',
  'failed',
  'all',
];
export const RESUME_MAX_PER_REQUEST = 1000;
export const DELIVERY_LOCK_STALE_MS = 30 * 60 * 1000;

function scopeStatuses(scope: ResumeScope): string[] {
  if (scope === 'pending') return ['pending'];
  if (scope === 'failed') return ['failed'];
  return ['pending', 'failed'];
}

export async function claimBroadcastDelivery(
  database: WhatsAppQueryDb,
  accountId: string,
  broadcastId: string,
  now: Date = new Date()
): Promise<boolean> {
  const staleCutoff = new Date(
    now.getTime() - DELIVERY_LOCK_STALE_MS
  ).toISOString();

  try {
    const rows = await database
      .update(schema.broadcasts)
      .set({ deliveryLockedAt: now.toISOString() })
      .where(
        and(
          eq(schema.broadcasts.id, broadcastId),
          eq(schema.broadcasts.accountId, accountId),
          or(
            isNull(schema.broadcasts.deliveryLockedAt),
            lt(schema.broadcasts.deliveryLockedAt, staleCutoff)
          )
        )
      )
      .returning({ id: schema.broadcasts.id });
    return rows.length > 0;
  } catch (error) {
    console.error('[broadcast-resume] claim failed:', error);
    return false;
  }
}

export async function releaseBroadcastDelivery(
  database: WhatsAppQueryDb,
  broadcastId: string
): Promise<void> {
  try {
    await database
      .update(schema.broadcasts)
      .set({ deliveryLockedAt: null })
      .where(eq(schema.broadcasts.id, broadcastId));
  } catch (error) {
    console.error('[broadcast-resume] release failed:', error);
  }
}

export interface ResumePlan {
  plan: BroadcastPlan;
  remaining: number;
  unsendable: number;
}

interface RecipientRow {
  id: string;
  templateParams: unknown;
  phone: string | null;
}

export async function planBroadcastResume(
  database: WhatsAppQueryDb,
  accountId: string,
  broadcastId: string,
  scope: ResumeScope
): Promise<ResumePlan> {
  const [broadcast] = await database
    .select({
      id: schema.broadcasts.id,
      templateName: schema.broadcasts.templateName,
      templateLanguage: schema.broadcasts.templateLanguage,
    })
    .from(schema.broadcasts)
    .where(
      and(
        eq(schema.broadcasts.id, broadcastId),
        eq(schema.broadcasts.accountId, accountId)
      )
    )
    .limit(1);

  if (!broadcast) {
    throw new BroadcastError('not_found', 'Broadcast not found', 404);
  }

  let rows: RecipientRow[];
  try {
    rows = await database
      .select({
        id: schema.broadcastRecipients.id,
        templateParams: schema.broadcastRecipients.templateParams,
        phone: schema.contacts.phone,
      })
      .from(schema.broadcastRecipients)
      .leftJoin(
        schema.contacts,
        eq(schema.contacts.id, schema.broadcastRecipients.contactId)
      )
      .where(
        and(
          eq(schema.broadcastRecipients.broadcastId, broadcastId),
          inArray(schema.broadcastRecipients.status, scopeStatuses(scope))
        )
      )
      .orderBy(asc(schema.broadcastRecipients.createdAt));
  } catch (error) {
    console.error('[broadcast-resume] recipient load failed:', error);
    throw new BroadcastError('internal', 'Failed to load recipients', 500);
  }

  const sendable: RecipientRow[] = [];
  const unsendable: string[] = [];
  for (const row of rows) {
    const sanitized = sanitizePhoneForMeta(row.phone ?? '');
    if (isValidE164(sanitized)) sendable.push(row);
    else unsendable.push(row.id);
  }

  if (unsendable.length > 0) {
    await database
      .update(schema.broadcastRecipients)
      .set({
        status: 'failed',
        errorMessage: 'No valid phone number on contact',
      })
      .where(inArray(schema.broadcastRecipients.id, unsendable));
  }

  const slice = sendable.slice(0, RESUME_MAX_PER_REQUEST);
  const remaining = sendable.length - slice.length;
  if (slice.length === 0) {
    throw new BroadcastError(
      'nothing_to_resume',
      scope === 'failed'
        ? 'This broadcast has no failed recipients to retry'
        : 'This broadcast has no recipients left to send',
      400
    );
  }

  const [config] = await database
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

  const resolvedTemplate = await resolveTemplateRow(
    database,
    accountId,
    broadcast.templateName,
    broadcast.templateLanguage
  );
  if (resolvedTemplate.malformed) {
    throw new BroadcastError(
      'template_malformed',
      'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before resuming.',
      500
    );
  }

  const plan: BroadcastPlan = {
    broadcastId,
    templateName: broadcast.templateName,
    templateLanguage: resolvedTemplate.language,
    phoneNumberId: config.phoneNumberId,
    accessToken: decrypt(config.accessToken),
    templateRow: resolvedTemplate.row,
    planned: slice.map((row) => ({
      recipientRowId: row.id,
      phone: sanitizePhoneForMeta(row.phone ?? ''),
      params: Array.isArray(row.templateParams)
        ? row.templateParams.filter((p): p is string => typeof p === 'string')
        : [],
    })),
    rejected: 0,
  };

  return { plan, remaining, unsendable: unsendable.length };
}

export async function markBroadcastSending(
  database: WhatsAppQueryDb,
  broadcastId: string
): Promise<void> {
  await database
    .update(schema.broadcasts)
    .set({ status: 'sending', updatedAt: new Date().toISOString() })
    .where(eq(schema.broadcasts.id, broadcastId));
}
