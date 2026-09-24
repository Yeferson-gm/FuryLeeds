import { aiUsageLog } from '@/lib/db/crm-schema';
import type { AiDatabase, AiProvider, AiUsage } from './types';

export interface LogAiUsageArgs {
  accountId: string;
  conversationId: string | null;
  mode: 'auto_reply' | 'draft';
  provider: AiProvider;
  model: string;
  usage: AiUsage | null;
}

/** Best-effort usage accounting. It must never fail a generated reply. */
export async function logAiUsage(
  db: AiDatabase,
  args: LogAiUsageArgs
): Promise<void> {
  if (!args.usage) return;
  try {
    await db.insert(aiUsageLog).values({
      accountId: args.accountId,
      conversationId: args.conversationId,
      mode: args.mode,
      provider: args.provider,
      model: args.model,
      promptTokens: args.usage.promptTokens,
      completionTokens: args.usage.completionTokens,
      totalTokens: args.usage.totalTokens,
    });
  } catch (err) {
    console.error('[ai usage] log insert failed:', err);
  }
}
