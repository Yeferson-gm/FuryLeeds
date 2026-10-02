import { and, asc, eq, ilike } from 'drizzle-orm';
import type { db as appDb } from '@/lib/db';
import { schema } from '@/lib/db';
import { decodeJsonbValue } from '@/lib/db/jsonb';
import { normalizePhone, phonesMatch } from '@/lib/whatsapp/phone-utils';
import type { MessageTemplate } from '@/types';

export type WhatsAppDb = typeof appDb;
export type WhatsAppQueryDb = Pick<
  WhatsAppDb,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;

export type WhatsAppConfigRow = typeof schema.whatsappConfig.$inferSelect;
export type MessageTemplateRow = typeof schema.messageTemplates.$inferSelect;

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    code?: string;
    cause?: { code?: string };
  };
  return candidate.code === '23505' || candidate.cause?.code === '23505';
}

export function toMessageTemplate(row: MessageTemplateRow): MessageTemplate {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    category: row.category as MessageTemplate['category'],
    language: row.language ?? undefined,
    header_type:
      (row.headerType as MessageTemplate['header_type']) ?? undefined,
    header_content: row.headerContent ?? undefined,
    header_handle: row.headerHandle ?? undefined,
    header_media_url: row.headerMediaUrl ?? undefined,
    body_text: row.bodyText,
    footer_text: row.footerText ?? undefined,
    buttons:
      decodeJsonbValue<MessageTemplate['buttons']>(row.buttons) ?? undefined,
    sample_values:
      decodeJsonbValue<MessageTemplate['sample_values']>(row.sampleValues) ??
      undefined,
    status: (row.status as MessageTemplate['status']) ?? undefined,
    meta_template_id: row.metaTemplateId ?? undefined,
    rejection_reason: row.rejectionReason ?? undefined,
    quality_score:
      (row.qualityScore as MessageTemplate['quality_score']) ?? undefined,
    submission_error: row.submissionError ?? undefined,
    last_submitted_at: row.lastSubmittedAt ?? undefined,
    created_at: row.createdAt ?? '',
  };
}

export interface ExistingContact {
  id: string;
  phone: string;
  name: string | null;
  waUserId: string | null;
}

export async function findExistingContact(
  database: WhatsAppQueryDb,
  accountId: string,
  phone: string
): Promise<ExistingContact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const suffix = normalized.length >= 8 ? normalized.slice(-8) : normalized;
  const candidates = await database
    .select({
      id: schema.contacts.id,
      phone: schema.contacts.phone,
      name: schema.contacts.name,
      waUserId: schema.contacts.waUserId,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.accountId, accountId),
        ilike(schema.contacts.phone, `%${suffix}`)
      )
    );

  return (
    candidates.find((contact) => phonesMatch(contact.phone, phone)) ?? null
  );
}

export async function resolveAuditUserId(
  database: WhatsAppQueryDb,
  accountId: string
): Promise<string> {
  const [config] = await database
    .select({ userId: schema.whatsappConfig.userId })
    .from(schema.whatsappConfig)
    .where(eq(schema.whatsappConfig.accountId, accountId))
    .limit(1);
  if (config?.userId) return config.userId;

  const [account] = await database
    .select({ ownerUserId: schema.accounts.ownerUserId })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .limit(1);
  if (!account?.ownerUserId) {
    throw new Error('Account owner could not be resolved');
  }
  return account.ownerUserId;
}

export async function findOrCreateContact(
  database: WhatsAppQueryDb,
  accountId: string,
  auditUserId: string,
  phone: string,
  name?: string | null
): Promise<{ id: string; created: boolean }> {
  const existing = await findExistingContact(database, accountId, phone);
  if (existing) return { id: existing.id, created: false };

  try {
    const [created] = await database
      .insert(schema.contacts)
      .values({
        accountId,
        userId: auditUserId,
        phone,
        name: name ?? phone,
      })
      .returning({ id: schema.contacts.id });
    if (!created) throw new Error('Contact insert returned no row');
    return { id: created.id, created: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await findExistingContact(database, accountId, phone);
      if (raced) return { id: raced.id, created: false };
    }
    throw error;
  }
}

export async function findConversationId(
  database: WhatsAppQueryDb,
  accountId: string,
  contactId: string
): Promise<string | null> {
  const [conversation] = await database
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.accountId, accountId),
        eq(schema.conversations.contactId, contactId)
      )
    )
    .orderBy(asc(schema.conversations.createdAt))
    .limit(1);
  return conversation?.id ?? null;
}
