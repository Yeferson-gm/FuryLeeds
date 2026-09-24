import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import type {
  ContentType,
  InteractiveMessagePayload,
  Message,
  MessageReaction,
  MessageStatus,
  ReactionActor,
  SenderType,
} from '@/types';

type RouteContext = { params: Promise<{ id: string }> };

type MessageRow = typeof schema.messages.$inferSelect;
type ReactionRow = typeof schema.messageReactions.$inferSelect;

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversation_id: row.conversationId,
    sender_type: row.senderType as SenderType,
    sender_id: row.senderId ?? undefined,
    content_type: row.contentType as ContentType,
    content_text: row.contentText ?? undefined,
    media_url: row.mediaUrl ?? undefined,
    media_type: row.mediaType,
    template_name: row.templateName ?? undefined,
    message_id: row.messageId ?? undefined,
    status: row.status as MessageStatus,
    created_at: row.createdAt ?? '',
    reply_to_message_id: row.replyToMessageId ?? undefined,
    interactive_reply_id: row.interactiveReplyId ?? undefined,
    interactive_payload:
      (row.interactivePayload as InteractiveMessagePayload | null) ?? undefined,
    ai_generated: row.aiGenerated,
    error_code: row.errorCode,
    error_title: row.errorTitle,
    error_details: row.errorDetails,
  };
}

function toReaction(row: ReactionRow): MessageReaction {
  return {
    id: row.id,
    message_id: row.messageId,
    conversation_id: row.conversationId,
    actor_type: row.actorType as ReactionActor,
    actor_id: row.actorId ?? undefined,
    emoji: row.emoji,
    created_at: row.createdAt,
  };
}

async function ownsConversation(
  db: Awaited<ReturnType<typeof requireRole>>['db'],
  accountId: string,
  conversationId: string
) {
  const [conversation] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.accountId, accountId)
      )
    )
    .limit(1);
  return conversation;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('viewer');
    const { id } = await params;
    if (!(await ownsConversation(ctx.db, ctx.accountId, id))) {
      return NextResponse.json(
        { error: 'Conversación no encontrada' },
        { status: 404 }
      );
    }

    const [messageRows, reactionRows] = await Promise.all([
      ctx.db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, id))
        .orderBy(asc(schema.messages.createdAt)),
      ctx.db
        .select({ reaction: schema.messageReactions })
        .from(schema.messageReactions)
        .innerJoin(
          schema.conversations,
          and(
            eq(schema.conversations.id, schema.messageReactions.conversationId),
            eq(schema.conversations.accountId, ctx.accountId)
          )
        )
        .where(eq(schema.messageReactions.conversationId, id)),
    ]);

    return NextResponse.json({
      messages: messageRows.map(toMessage),
      reactions: reactionRows.map(({ reaction }) => toReaction(reaction)),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await params;
    if (!(await ownsConversation(ctx.db, ctx.accountId, id))) {
      return NextResponse.json(
        { error: 'Conversación no encontrada' },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
      assigned_agent_id?: unknown;
      unread_count?: unknown;
    } | null;
    const updates: Partial<typeof schema.conversations.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (body && 'status' in body) {
      if (!['open', 'pending', 'closed'].includes(String(body.status))) {
        return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
      }
      updates.status = String(body.status);
    }

    if (body && 'unread_count' in body) {
      if (body.unread_count !== 0) {
        return NextResponse.json(
          { error: 'El inbox solo permite marcar como leído' },
          { status: 400 }
        );
      }
      updates.unreadCount = 0;
    }

    if (body && 'assigned_agent_id' in body) {
      if (
        body.assigned_agent_id !== null &&
        typeof body.assigned_agent_id !== 'string'
      ) {
        return NextResponse.json(
          { error: 'Asignación inválida' },
          { status: 400 }
        );
      }
      if (typeof body.assigned_agent_id === 'string') {
        const [profile] = await ctx.db
          .select({ userId: schema.profiles.userId })
          .from(schema.profiles)
          .where(
            and(
              eq(schema.profiles.userId, body.assigned_agent_id),
              eq(schema.profiles.accountId, ctx.accountId)
            )
          )
          .limit(1);
        if (!profile) {
          return NextResponse.json(
            { error: 'Agente no encontrado' },
            { status: 404 }
          );
        }
      }
      updates.assignedAgentId = body.assigned_agent_id as string | null;
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { error: 'No hay cambios válidos' },
        { status: 400 }
      );
    }

    await ctx.db
      .update(schema.conversations)
      .set(updates)
      .where(
        and(
          eq(schema.conversations.id, id),
          eq(schema.conversations.accountId, ctx.accountId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
