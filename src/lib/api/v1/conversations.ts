import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { schema } from '@/lib/db';
import type { WhatsAppQueryDb } from '@/lib/whatsapp/db';
import type { Conversation, Message } from '@/types';
import type { Cursor } from './pagination';

export interface ApiConversation {
  id: string;
  contact_id: string;
  status: string;
  assigned_agent_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
    company: string | null;
    tags: { id: string; name: string; color: string }[];
  } | null;
}

export interface ApiMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: string;
  content_type: string;
  content_text: string | null;
  media_url: string | null;
  template_name: string | null;
  whatsapp_message_id: string | null;
  status: string;
  reply_to_message_id: string | null;
  interactive_reply_id: string | null;
  created_at: string;
}

export function serializeConversation(conv: Conversation): ApiConversation {
  const contact = conv.contact;
  return {
    id: conv.id,
    contact_id: conv.contact_id,
    status: conv.status,
    assigned_agent_id: conv.assigned_agent_id ?? null,
    last_message_text: conv.last_message_text ?? null,
    last_message_at: conv.last_message_at ?? null,
    unread_count: conv.unread_count ?? 0,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    contact: contact
      ? {
          id: contact.id,
          phone: contact.phone,
          name: contact.name ?? null,
          email: contact.email ?? null,
          company: contact.company ?? null,
          tags: (contact.tags ?? []).map(({ id, name, color }) => ({
            id,
            name,
            color,
          })),
        }
      : null,
  };
}

export function serializeMessage(message: Message): ApiMessage {
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    direction: message.sender_type === 'customer' ? 'inbound' : 'outbound',
    sender_type: message.sender_type,
    content_type: message.content_type,
    content_text: message.content_text ?? null,
    media_url: message.media_url ?? null,
    template_name: message.template_name ?? null,
    whatsapp_message_id: message.message_id ?? null,
    status: message.status,
    reply_to_message_id: message.reply_to_message_id ?? null,
    interactive_reply_id: message.interactive_reply_id ?? null,
    created_at: message.created_at,
  };
}

function conversationSelection() {
  return {
    id: schema.conversations.id,
    user_id: schema.conversations.userId,
    account_id: schema.conversations.accountId,
    contact_id: schema.conversations.contactId,
    status: schema.conversations.status,
    assigned_agent_id: schema.conversations.assignedAgentId,
    last_message_text: schema.conversations.lastMessageText,
    last_message_at: schema.conversations.lastMessageAt,
    unread_count: schema.conversations.unreadCount,
    created_at: schema.conversations.createdAt,
    updated_at: schema.conversations.updatedAt,
    contactId: schema.contacts.id,
    contactPhone: schema.contacts.phone,
    contactName: schema.contacts.name,
    contactEmail: schema.contacts.email,
    contactCompany: schema.contacts.company,
    contactAvatarUrl: schema.contacts.avatarUrl,
    contactCreatedAt: schema.contacts.createdAt,
    contactUpdatedAt: schema.contacts.updatedAt,
    contactUserId: schema.contacts.userId,
    contactAccountId: schema.contacts.accountId,
  };
}

type ConversationRow = Awaited<
  ReturnType<typeof selectConversationRows>
>[number];

async function selectConversationRows(
  database: WhatsAppQueryDb,
  accountId: string,
  options: {
    id?: string;
    status?: string | null;
    contactId?: string | null;
    cursor?: Cursor | null;
    limit?: number;
  }
) {
  const filters = [eq(schema.conversations.accountId, accountId)];
  if (options.id) filters.push(eq(schema.conversations.id, options.id));
  if (options.status)
    filters.push(eq(schema.conversations.status, options.status));
  if (options.contactId) {
    filters.push(eq(schema.conversations.contactId, options.contactId));
  }
  if (options.cursor) {
    const pastCursor = or(
      lt(schema.conversations.createdAt, options.cursor.createdAt),
      and(
        eq(schema.conversations.createdAt, options.cursor.createdAt),
        lt(schema.conversations.id, options.cursor.id)
      )
    );
    if (pastCursor) filters.push(pastCursor);
  }
  return database
    .select(conversationSelection())
    .from(schema.conversations)
    .innerJoin(
      schema.contacts,
      and(
        eq(schema.contacts.id, schema.conversations.contactId),
        eq(schema.contacts.accountId, accountId)
      )
    )
    .where(and(...filters))
    .orderBy(
      desc(schema.conversations.createdAt),
      desc(schema.conversations.id)
    )
    .limit(options.limit ?? 1);
}

async function hydrateConversations(
  database: WhatsAppQueryDb,
  accountId: string,
  rows: ConversationRow[]
): Promise<ApiConversation[]> {
  if (rows.length === 0) return [];
  const contactIds = [...new Set(rows.map((row) => row.contact_id))];
  const tagRows = await database
    .select({
      contactId: schema.contactTags.contactId,
      id: schema.tags.id,
      name: schema.tags.name,
      color: schema.tags.color,
    })
    .from(schema.contactTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.contactTags.contactId)
    )
    .where(
      and(
        inArray(schema.contactTags.contactId, contactIds),
        eq(schema.contacts.accountId, accountId),
        eq(schema.tags.accountId, accountId)
      )
    );
  const tags = new Map<string, { id: string; name: string; color: string }[]>();
  for (const tag of tagRows) {
    const list = tags.get(tag.contactId) ?? [];
    list.push({ id: tag.id, name: tag.name, color: tag.color });
    tags.set(tag.contactId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    contact_id: row.contact_id,
    status: row.status,
    assigned_agent_id: row.assigned_agent_id,
    last_message_text: row.last_message_text,
    last_message_at: row.last_message_at,
    unread_count: row.unread_count ?? 0,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
    contact: row.contactId
      ? {
          id: row.contactId,
          phone: row.contactPhone,
          name: row.contactName,
          email: row.contactEmail,
          company: row.contactCompany,
          tags: tags.get(row.contactId) ?? [],
        }
      : null,
  }));
}

export async function listConversations(
  database: WhatsAppQueryDb,
  accountId: string,
  options: {
    limit: number;
    cursor: Cursor | null;
    status: string | null;
    contactId: string | null;
  }
): Promise<ApiConversation[]> {
  const rows = await selectConversationRows(database, accountId, {
    ...options,
    limit: options.limit + 1,
  });
  return hydrateConversations(database, accountId, rows);
}

export async function getConversationById(
  database: WhatsAppQueryDb,
  accountId: string,
  id: string
): Promise<ApiConversation | null> {
  const rows = await selectConversationRows(database, accountId, { id });
  return (await hydrateConversations(database, accountId, rows))[0] ?? null;
}

function toApiMessage(row: typeof schema.messages.$inferSelect): ApiMessage {
  return {
    id: row.id,
    conversation_id: row.conversationId,
    direction: row.senderType === 'customer' ? 'inbound' : 'outbound',
    sender_type: row.senderType,
    content_type: row.contentType,
    content_text: row.contentText,
    media_url: row.mediaUrl,
    template_name: row.templateName,
    whatsapp_message_id: row.messageId,
    status: row.status,
    reply_to_message_id: row.replyToMessageId,
    interactive_reply_id: row.interactiveReplyId,
    created_at: row.createdAt ?? '',
  };
}

export async function listConversationMessages(
  database: WhatsAppQueryDb,
  accountId: string,
  conversationId: string,
  options: { limit: number; cursor: Cursor | null }
): Promise<ApiMessage[] | null> {
  const [conversation] = await database
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.accountId, accountId)
      )
    )
    .limit(1);
  if (!conversation) return null;

  const filters = [eq(schema.messages.conversationId, conversationId)];
  if (options.cursor) {
    const pastCursor = or(
      lt(schema.messages.createdAt, options.cursor.createdAt),
      and(
        eq(schema.messages.createdAt, options.cursor.createdAt),
        lt(schema.messages.id, options.cursor.id)
      )
    );
    if (pastCursor) filters.push(pastCursor);
  }
  const rows = await database
    .select()
    .from(schema.messages)
    .innerJoin(
      schema.conversations,
      and(
        eq(schema.conversations.id, schema.messages.conversationId),
        eq(schema.conversations.accountId, accountId)
      )
    )
    .where(and(...filters))
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(options.limit + 1);
  return rows.map((row) => toApiMessage(row.messages));
}
