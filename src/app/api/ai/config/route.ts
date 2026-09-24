import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { embedTexts } from '@/lib/ai/embeddings';
import { AiError, type AiProvider } from '@/lib/ai/types';
import { validateAiCredentials } from '@/lib/ai/validate';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  try {
    const { db, accountId } = await requireRole('viewer');
    let data: {
      provider: string;
      model: string;
      system_prompt: string | null;
      is_active: boolean;
      auto_reply_enabled: boolean;
      auto_reply_max_per_conversation: number;
      handoff_agent_id: string | null;
      api_key: string;
      embeddings_api_key: string | null;
    } | null = null;
    try {
      const [row] = await db
        .select({
          provider: schema.aiConfigs.provider,
          model: schema.aiConfigs.model,
          system_prompt: schema.aiConfigs.systemPrompt,
          is_active: schema.aiConfigs.isActive,
          auto_reply_enabled: schema.aiConfigs.autoReplyEnabled,
          auto_reply_max_per_conversation:
            schema.aiConfigs.autoReplyMaxPerConversation,
          handoff_agent_id: schema.aiConfigs.handoffAgentId,
          api_key: schema.aiConfigs.apiKey,
          embeddings_api_key: schema.aiConfigs.embeddingsApiKey,
        })
        .from(schema.aiConfigs)
        .where(eq(schema.aiConfigs.accountId, accountId))
        .limit(1);
      data = row ?? null;
    } catch (error) {
      console.error('[ai/config GET] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load AI configuration' },
        { status: 500 }
      );
    }

    if (!data) return NextResponse.json({ configured: false });
    const { api_key, embeddings_api_key, ...safe } = data;
    return NextResponse.json({
      configured: true,
      has_key: !!api_key,
      has_embeddings_key: !!embeddings_api_key,
      ...safe,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { db, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `ai-config:${userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return bad('Invalid request body');

    const provider = body.provider as AiProvider;
    if (provider !== 'openai' && provider !== 'anthropic') {
      return bad('provider must be "openai" or "anthropic"');
    }
    const model = typeof body.model === 'string' ? body.model.trim() : '';
    if (!model) return bad('model is required');

    const systemPrompt =
      typeof body.system_prompt === 'string' && body.system_prompt.trim()
        ? body.system_prompt.trim()
        : null;
    const isActive = body.is_active === true;
    const autoReplyEnabled = body.auto_reply_enabled === true;
    let maxPer = Number(body.auto_reply_max_per_conversation);
    if (!Number.isFinite(maxPer)) maxPer = 3;
    maxPer = Math.min(20, Math.max(1, Math.floor(maxPer)));

    const rawHandoff =
      typeof body.handoff_agent_id === 'string'
        ? body.handoff_agent_id.trim()
        : '';
    const handoffProvided = 'handoff_agent_id' in body;
    let handoffAgentId: string | null = null;
    if (rawHandoff) {
      const [member] = await db
        .select({ userId: schema.profiles.userId })
        .from(schema.profiles)
        .where(
          and(
            eq(schema.profiles.accountId, accountId),
            eq(schema.profiles.userId, rawHandoff)
          )
        )
        .limit(1);
      if (!member)
        return bad('handoff_agent_id must be a member of this account');
      handoffAgentId = rawHandoff;
    }

    const rawKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
    const rawEmbeddingsKey =
      typeof body.embeddings_api_key === 'string'
        ? body.embeddings_api_key.trim()
        : '';
    const clearEmbeddingsKey = body.embeddings_api_key === null;

    const [existing] = await db
      .select({
        id: schema.aiConfigs.id,
        provider: schema.aiConfigs.provider,
        model: schema.aiConfigs.model,
        apiKey: schema.aiConfigs.apiKey,
      })
      .from(schema.aiConfigs)
      .where(eq(schema.aiConfigs.accountId, accountId))
      .limit(1);

    let apiKeyPlain: string;
    if (rawKey) {
      apiKeyPlain = rawKey;
    } else if (existing?.apiKey) {
      try {
        apiKeyPlain = decrypt(existing.apiKey);
      } catch {
        return bad(
          'Stored API key could not be decrypted — re-enter your key.'
        );
      }
    } else {
      return bad('api_key is required');
    }

    const credentialsChanged =
      !existing ||
      rawKey !== '' ||
      provider !== existing.provider ||
      model !== existing.model;
    if (credentialsChanged) {
      try {
        await validateAiCredentials({
          provider,
          model,
          apiKey: apiKeyPlain,
          systemPrompt,
          isActive,
          autoReplyEnabled,
          autoReplyMaxPerConversation: maxPer,
          handoffAgentId: null,
          embeddingsApiKey: null,
        });
      } catch (err) {
        if (err instanceof AiError) {
          return NextResponse.json(
            { error: err.message, code: err.code },
            { status: 400 }
          );
        }
        console.error('[ai/config POST] validation error:', err);
        return bad('Could not validate the API key with the provider.');
      }
    }

    if (rawEmbeddingsKey) {
      try {
        await embedTexts(rawEmbeddingsKey, ['ping']);
      } catch (err) {
        if (err instanceof AiError) {
          return NextResponse.json(
            { error: `Embeddings key: ${err.message}`, code: err.code },
            { status: 400 }
          );
        }
        console.error('[ai/config POST] embeddings validation error:', err);
        return bad('Could not validate the embeddings key.');
      }
    }

    const shared: Partial<typeof schema.aiConfigs.$inferInsert> = {
      provider,
      model,
      systemPrompt,
      isActive,
      autoReplyEnabled,
      autoReplyMaxPerConversation: maxPer,
    };
    if (handoffProvided) shared.handoffAgentId = handoffAgentId;
    if (rawEmbeddingsKey) {
      shared.embeddingsApiKey = encrypt(rawEmbeddingsKey);
    } else if (clearEmbeddingsKey) {
      shared.embeddingsApiKey = null;
    }

    try {
      if (existing) {
        await db
          .update(schema.aiConfigs)
          .set(rawKey ? { ...shared, apiKey: encrypt(rawKey) } : shared)
          .where(eq(schema.aiConfigs.accountId, accountId));
      } else {
        await db.insert(schema.aiConfigs).values({
          accountId,
          createdBy: userId,
          apiKey: encrypt(rawKey),
          provider,
          model,
          systemPrompt,
          isActive,
          autoReplyEnabled,
          autoReplyMaxPerConversation: maxPer,
          handoffAgentId: handoffProvided ? handoffAgentId : undefined,
          embeddingsApiKey: rawEmbeddingsKey
            ? encrypt(rawEmbeddingsKey)
            : undefined,
        });
      }
    } catch (error) {
      console.error('[ai/config POST] save error:', error);
      return NextResponse.json(
        { error: 'Failed to save AI configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const { db, accountId } = await requireRole('admin');
    try {
      await db
        .delete(schema.aiConfigs)
        .where(eq(schema.aiConfigs.accountId, accountId));
    } catch (error) {
      console.error('[ai/config DELETE] error:', error);
      return NextResponse.json(
        { error: 'Failed to delete AI configuration' },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
