import { and, eq } from 'drizzle-orm';
import { type db, schema } from '@/lib/db';

type ConversationWriteDb = Pick<typeof db, 'update'>;

/**
 * Re-open a closed conversation because the customer wrote again.
 *
 * The conditional, account-scoped update prevents a stale inbound worker from
 * reopening a thread that an agent has already changed again. This is
 * best-effort: inbound processing must continue even if the update fails.
 */
export async function reopenClosedConversation(
  database: ConversationWriteDb,
  conversation: {
    id: string;
    accountId: string;
    status?: string | null;
  }
): Promise<boolean> {
  if (conversation.status !== 'closed') return false;

  try {
    const rows = await database
      .update(schema.conversations)
      .set({ status: 'open', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.conversations.id, conversation.id),
          eq(schema.conversations.accountId, conversation.accountId),
          eq(schema.conversations.status, 'closed')
        )
      )
      .returning({ id: schema.conversations.id });
    return rows.length > 0;
  } catch (error) {
    console.error('Error re-opening conversation:', error);
    return false;
  }
}
