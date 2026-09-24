import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { loadAiConfig } from '@/lib/ai/config';
import { buildConversationContext } from '@/lib/ai/context';
import { buildSystemPrompt } from '@/lib/ai/defaults';
import { generateReply } from '@/lib/ai/generate';
import { retrieveKnowledge } from '@/lib/ai/knowledge';
import { latestUserMessage } from '@/lib/ai/query';
import { AiError } from '@/lib/ai/types';
import { logAiUsage } from '@/lib/ai/usage';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const { db, accountId, userId } = await requireRole('agent');
    const userLimit = checkRateLimit(`ai-draft:${userId}`, RATE_LIMITS.aiDraft);
    if (!userLimit.success) return rateLimitResponse(userLimit);
    const accountLimit = checkRateLimit(
      `ai-draft-acct:${accountId}`,
      RATE_LIMITS.aiDraftAccount
    );
    if (!accountLimit.success) return rateLimitResponse(accountLimit);

    const body = await request.json().catch(() => null);
    const conversationId =
      body && typeof body.conversation_id === 'string'
        ? body.conversation_id
        : '';
    if (!conversationId) {
      return NextResponse.json(
        { error: 'El campo conversation_id es obligatorio' },
        { status: 400 }
      );
    }

    let conversation: { id: string } | undefined;
    try {
      [conversation] = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.accountId, accountId)
          )
        )
        .limit(1);
    } catch (error) {
      console.error('[ai/draft] conversation lookup error:', error);
      return NextResponse.json(
        { error: 'No se pudo cargar la conversación' },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: 'No se encontró la conversación' },
        { status: 404 }
      );
    }

    const config = await loadAiConfig(db, accountId).catch((err) => {
      console.error('[ai/draft] loadAiConfig error:', err);
      throw new AiError('No se pudo descifrar la clave de API guardada.', {
        code: 'key_decrypt_failed',
        status: 400,
      });
    });
    if (!config) {
      return NextResponse.json(
        {
          error:
            'El asistente de IA no está configurado. Actívalo en Configuración → Asistente de IA.',
          code: 'ai_not_configured',
        },
        { status: 400 }
      );
    }

    const messages = await buildConversationContext(
      db,
      accountId,
      conversationId
    );
    if (messages.length === 0) {
      return NextResponse.json(
        {
          error:
            'Aún no hay mensajes a partir de los cuales crear un borrador.',
          code: 'no_messages',
        },
        { status: 400 }
      );
    }

    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages)
    );
    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'draft',
      knowledge,
    });
    const { text, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    });

    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'draft',
      provider: config.provider,
      model: config.model,
      usage,
    });

    return NextResponse.json({ draft: text });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    return toErrorResponse(err);
  }
}
