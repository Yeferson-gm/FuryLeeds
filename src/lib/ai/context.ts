import { and, desc, eq } from 'drizzle-orm';
import { conversations, messages } from '@/lib/db/crm-schema';
import { aiContextMessageLimit } from './defaults';
import type { AiDatabase, ChatMessage } from './types';

/**
 * Fetch the last N text messages and return them in chronological order.
 * Customer messages become `user`; agent and bot messages become
 * `assistant`.
 */
export async function buildConversationContext(
  db: AiDatabase,
  accountId: string,
  conversationId: string,
  limit: number = aiContextMessageLimit()
): Promise<ChatMessage[]> {
  const rows = await db
    .select({
      senderType: messages.senderType,
      contentText: messages.contentText,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(conversations.accountId, accountId),
        eq(messages.conversationId, conversationId),
        eq(messages.contentType, 'text')
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows.reverse().flatMap((message) => {
    const content = message.contentText?.trim();
    if (!content) return [];
    return [
      {
        role: message.senderType === 'customer' ? 'user' : 'assistant',
        content,
      } satisfies ChatMessage,
    ];
  });
}
