import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db';
import {
  findConversationId,
  findExistingContact,
  findOrCreateContact,
  isUniqueViolation,
  resolveAuditUserId,
  type WhatsAppDb,
  type WhatsAppQueryDb,
} from '@/lib/whatsapp/db';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';
import { SendMessageError } from '@/lib/whatsapp/send-message';

export interface ResolvedConversation {
  conversationId: string;
  contactId: string;
  contactCreated: boolean;
}

export async function resolveConversationByPhone(
  database: WhatsAppDb,
  accountId: string,
  phone: string,
  name?: string | null
): Promise<ResolvedConversation> {
  const sanitized = parseInternationalPhone(phone);
  if (!sanitized) {
    throw new SendMessageError(
      'bad_request',
      "'to' must be an international phone number with a leading + and country code (e.g. +14155550123)",
      400
    );
  }

  const [config] = await database
    .select({ id: schema.whatsappConfig.id })
    .from(schema.whatsappConfig)
    .where(eq(schema.whatsappConfig.accountId, accountId))
    .limit(1);
  if (!config) {
    throw new SendMessageError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }

  let ownerUserId: string;
  try {
    ownerUserId = await resolveAuditUserId(database, accountId);
  } catch (error) {
    console.error('[resolve-conversation] audit user lookup error:', error);
    throw new SendMessageError(
      'db_error',
      'Account owner could not be resolved',
      500
    );
  }

  let contactId: string;
  let contactCreated = false;
  const existing = await findExistingContact(database, accountId, sanitized);

  if (existing) {
    contactId = existing.id;
    if (name && name !== existing.name) {
      await database
        .update(schema.contacts)
        .set({ name, updatedAt: new Date().toISOString() })
        .where(eq(schema.contacts.id, existing.id));
    }
  } else {
    try {
      const contact = await findOrCreateContact(
        database,
        accountId,
        ownerUserId,
        sanitized,
        name
      );
      contactId = contact.id;
      contactCreated = contact.created;
    } catch (error) {
      console.error('[resolve-conversation] contact create error:', error);
      throw new SendMessageError('db_error', 'Failed to create contact', 500);
    }
  }

  const conversationId = await findOrCreateConversationRow(
    database,
    accountId,
    contactId,
    ownerUserId
  );

  return { conversationId, contactId, contactCreated };
}

async function findOrCreateConversationRow(
  database: WhatsAppQueryDb,
  accountId: string,
  contactId: string,
  ownerUserId: string
): Promise<string> {
  const existingId = await findConversationId(database, accountId, contactId);
  if (existingId) return existingId;

  try {
    const [created] = await database
      .insert(schema.conversations)
      .values({ accountId, userId: ownerUserId, contactId })
      .returning({ id: schema.conversations.id });
    if (!created) throw new Error('Conversation insert returned no row');
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const racedId = await findConversationId(database, accountId, contactId);
      if (racedId) return racedId;
    }
    console.error('[resolve-conversation] conversation create error:', error);
    throw new SendMessageError(
      'db_error',
      'Failed to create conversation',
      500
    );
  }
}
