import { NextResponse } from 'next/server';
import { loadAiConfig } from '@/lib/ai/config';
import { buildSystemPrompt } from '@/lib/ai/defaults';
import { generateReply } from '@/lib/ai/generate';
import { retrieveKnowledge } from '@/lib/ai/knowledge';
import { latestUserMessage } from '@/lib/ai/query';
import { AiError, type ChatMessage } from '@/lib/ai/types';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

const MAX_TURNS = 20;

export async function POST(request: Request) {
  try {
    const { db, accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(
      `ai-playground:${userId}`,
      RATE_LIMITS.aiDraft
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const rawMessages = Array.isArray(body?.messages) ? body.messages : null;
    if (!rawMessages) {
      return NextResponse.json(
        { error: 'El campo messages es obligatorio' },
        { status: 400 }
      );
    }

    const messages: ChatMessage[] = rawMessages
      .filter(
        (message: unknown): message is ChatMessage =>
          !!message &&
          typeof message === 'object' &&
          ((message as ChatMessage).role === 'user' ||
            (message as ChatMessage).role === 'assistant') &&
          typeof (message as ChatMessage).content === 'string' &&
          (message as ChatMessage).content.trim().length > 0
      )
      .slice(-MAX_TURNS);
    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'Envía un mensaje para probar el agente.' },
        { status: 400 }
      );
    }

    const config = await loadAiConfig(db, accountId, {
      requireActive: false,
    }).catch((err) => {
      console.error('[ai/playground] loadAiConfig error:', err);
      throw new AiError('No se pudo descifrar la clave de API guardada.', {
        code: 'key_decrypt_failed',
        status: 400,
      });
    });
    if (!config) {
      return NextResponse.json(
        {
          error:
            'Aún no hay ningún agente configurado. Añade la clave de tu proveedor en Configuración.',
          code: 'ai_not_configured',
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
      mode: 'auto_reply',
      knowledge,
    });
    const { text, handoff } = await generateReply({
      config,
      systemPrompt,
      messages,
    });
    return NextResponse.json({ reply: text, handoff });
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
