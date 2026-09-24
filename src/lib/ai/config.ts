import { eq } from 'drizzle-orm';
import { aiConfigs } from '@/lib/db/crm-schema';
import { decrypt } from '@/lib/whatsapp/encryption';
import type { AiConfig, AiDatabase, AiProvider } from './types';

interface AiConfigRow {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string | null;
  isActive: boolean;
  autoReplyEnabled: boolean;
  autoReplyMaxPerConversation: number;
  handoffAgentId: string | null;
  embeddingsApiKey: string | null;
}

function isAiProvider(value: string): value is AiProvider {
  return value === 'openai' || value === 'anthropic';
}

/**
 * Load and decrypt the account's AI config for use by draft, playground,
 * or auto-reply. An absent/inactive row is represented by `null`.
 */
export async function loadAiConfig(
  db: AiDatabase,
  accountId: string,
  opts: { requireActive?: boolean } = {}
): Promise<AiConfig | null> {
  const { requireActive = true } = opts;
  const [row] = (await db
    .select({
      provider: aiConfigs.provider,
      model: aiConfigs.model,
      apiKey: aiConfigs.apiKey,
      systemPrompt: aiConfigs.systemPrompt,
      isActive: aiConfigs.isActive,
      autoReplyEnabled: aiConfigs.autoReplyEnabled,
      autoReplyMaxPerConversation: aiConfigs.autoReplyMaxPerConversation,
      handoffAgentId: aiConfigs.handoffAgentId,
      embeddingsApiKey: aiConfigs.embeddingsApiKey,
    })
    .from(aiConfigs)
    .where(eq(aiConfigs.accountId, accountId))
    .limit(1)) as AiConfigRow[];

  if (!row || (requireActive && !row.isActive) || !row.apiKey) return null;
  if (!isAiProvider(row.provider)) {
    throw new Error(`Unsupported stored AI provider: ${row.provider}`);
  }

  let embeddingsApiKey: string | null = null;
  if (row.embeddingsApiKey) {
    try {
      embeddingsApiKey = decrypt(row.embeddingsApiKey);
    } catch {
      console.error(
        `[ai config] embeddings key for account ${accountId} could not be decrypted — check ENCRYPTION_KEY; semantic search is disabled until it is re-entered.`
      );
    }
  }

  return {
    provider: row.provider,
    model: row.model,
    apiKey: decrypt(row.apiKey),
    systemPrompt: row.systemPrompt,
    isActive: row.isActive,
    autoReplyEnabled: row.autoReplyEnabled,
    autoReplyMaxPerConversation: row.autoReplyMaxPerConversation,
    handoffAgentId: row.handoffAgentId,
    embeddingsApiKey,
  };
}

/** Load and decrypt only the optional embeddings key. */
export async function loadEmbeddingsKey(
  db: AiDatabase,
  accountId: string
): Promise<{ key: string | null; corrupt: boolean }> {
  const [row] = await db
    .select({ embeddingsApiKey: aiConfigs.embeddingsApiKey })
    .from(aiConfigs)
    .where(eq(aiConfigs.accountId, accountId))
    .limit(1);

  if (!row?.embeddingsApiKey) return { key: null, corrupt: false };
  try {
    return { key: decrypt(row.embeddingsApiKey), corrupt: false };
  } catch {
    console.error(
      `[ai config] embeddings key for account ${accountId} could not be decrypted — check ENCRYPTION_KEY.`
    );
    return { key: null, corrupt: true };
  }
}
