import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { toContact, toTag } from '@/lib/contacts/repository';
import { schema } from '@/lib/db';
import type { Conversation, ConversationStatus, Tag } from '@/types';

function toConversation(
  row: typeof schema.conversations.$inferSelect,
  contact: typeof schema.contacts.$inferSelect,
  tags: Tag[]
): Conversation {
  return {
    id: row.id,
    user_id: row.userId,
    contact_id: row.contactId,
    status: row.status as ConversationStatus,
    assigned_agent_id: row.assignedAgentId ?? undefined,
    last_message_text: row.lastMessageText ?? undefined,
    last_message_at: row.lastMessageAt ?? undefined,
    unread_count: row.unreadCount ?? 0,
    created_at: row.createdAt ?? '',
    updated_at: row.updatedAt ?? '',
    ai_autoreply_disabled: row.aiAutoreplyDisabled,
    ai_reply_count: row.aiReplyCount,
    ai_handoff_summary: row.aiHandoffSummary,
    contact: { ...toContact(contact), tags },
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const conversationId = new URL(request.url).searchParams.get(
      'conversation_id'
    );
    const conditions = [eq(schema.conversations.accountId, ctx.accountId)];
    if (conversationId)
      conditions.push(eq(schema.conversations.id, conversationId));

    const rows = await ctx.db
      .select({ conversation: schema.conversations, contact: schema.contacts })
      .from(schema.conversations)
      .innerJoin(
        schema.contacts,
        eq(schema.contacts.id, schema.conversations.contactId)
      )
      .where(and(...conditions))
      .orderBy(desc(schema.conversations.lastMessageAt));

    const contactIds = rows.map(({ contact }) => contact.id);
    const tagRows =
      contactIds.length === 0
        ? []
        : await ctx.db
            .select({
              contactId: schema.contactTags.contactId,
              tag: schema.tags,
            })
            .from(schema.contactTags)
            .innerJoin(
              schema.tags,
              and(
                eq(schema.tags.id, schema.contactTags.tagId),
                eq(schema.tags.accountId, ctx.accountId)
              )
            )
            .where(inArray(schema.contactTags.contactId, contactIds));

    const tagsByContact = new Map<string, Tag[]>();
    for (const { contactId, tag } of tagRows) {
      const current = tagsByContact.get(contactId) ?? [];
      current.push(toTag(tag));
      tagsByContact.set(contactId, current);
    }

    const [allTags, config] = await Promise.all([
      ctx.db
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.accountId, ctx.accountId))
        .orderBy(asc(schema.tags.name)),
      ctx.db
        .select({ status: schema.whatsappConfig.status })
        .from(schema.whatsappConfig)
        .where(eq(schema.whatsappConfig.accountId, ctx.accountId))
        .limit(1),
    ]);

    return NextResponse.json({
      conversations: rows.map(({ conversation, contact }) =>
        toConversation(
          conversation,
          contact,
          tagsByContact.get(contact.id) ?? []
        )
      ),
      tags: allTags.map(toTag),
      whatsapp_connected: config[0]?.status === 'connected',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
