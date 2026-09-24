import { describe, expect, it } from 'bun:test';
import { required } from '@test/support/mocks';
import { loadAiConfig } from '@/lib/ai/config';
import type { AiDatabase } from '@/lib/ai/types';
import { encrypt } from '@/lib/whatsapp/encryption';

function dbReturning(row: Record<string, unknown> | null): AiDatabase {
  const query = {
    from: () => query,
    where: () => query,
    limit: () => Promise.resolve(row ? [row] : []),
  };
  return { select: () => query } as unknown as AiDatabase;
}

const ROW = {
  provider: 'openai',
  model: 'gpt-x',
  apiKey: encrypt('enc-key'),
  systemPrompt: null,
  isActive: false,
  autoReplyEnabled: false,
  autoReplyMaxPerConversation: 3,
  handoffAgentId: null,
  embeddingsApiKey: null,
};

describe('loadAiConfig requireActive', () => {
  it('returns null for an inactive config by default', async () => {
    expect(await loadAiConfig(dbReturning(ROW), 'acct')).toBeNull();
  });

  it('returns the config when requireActive is false (Playground path)', async () => {
    const config = await loadAiConfig(dbReturning(ROW), 'acct', {
      requireActive: false,
    });
    const loadedConfig = required(config, 'Expected inactive config to load');
    expect(loadedConfig.provider).toBe('openai');
    expect(loadedConfig.apiKey).toBe('enc-key');
  });

  it('returns null when there is no row', async () => {
    expect(
      await loadAiConfig(dbReturning(null), 'acct', { requireActive: false })
    ).toBeNull();
  });
});
