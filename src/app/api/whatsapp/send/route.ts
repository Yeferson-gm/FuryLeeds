import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';
import type { WhatsAppQueryDb } from '@/lib/whatsapp/db';
import {
  SendMessageError,
  sendMessageToConversation,
  validateSendMessageParams,
} from '@/lib/whatsapp/send-message';

export async function POST(request: Request) {
  try {
    const { db, accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(`send:${userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json();
    const {
      conversation_id: conversationIdInput,
      contact_id,
      message_type,
      content_text,
      media_url,
      filename,
      template_name,
      template_language,
      template_params,
      template_message_params,
      interactive_payload,
      reply_to_message_id,
    } = body;

    if ((!conversationIdInput && !contact_id) || !message_type) {
      return NextResponse.json(
        {
          error:
            'Se requiere conversation_id o contact_id, además de message_type',
        },
        { status: 400 }
      );
    }

    try {
      validateSendMessageParams({
        messageType: message_type,
        contentText: content_text,
        mediaUrl: media_url,
        templateName: template_name,
        interactivePayload: interactive_payload,
      });
    } catch (error) {
      if (error instanceof SendMessageError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }

    let conversationId: string | null = null;
    if (conversationIdInput) {
      const [conversation] = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.id, conversationIdInput),
            eq(schema.conversations.accountId, accountId)
          )
        )
        .limit(1);
      conversationId = conversation?.id ?? null;
    } else {
      const [contact] = await db
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.id, contact_id),
            eq(schema.contacts.accountId, accountId)
          )
        )
        .limit(1);
      if (!contact) {
        return NextResponse.json(
          { error: 'No se encontró el contacto' },
          { status: 404 }
        );
      }
      conversationId = await findOrCreateConversation(
        db,
        accountId,
        userId,
        contact.id
      );
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: 'No se encontró la conversación' },
        { status: 404 }
      );
    }

    try {
      const result = await sendMessageToConversation(db, accountId, {
        conversationId,
        messageType: message_type,
        contentText: content_text,
        mediaUrl: media_url,
        filename,
        templateName: template_name,
        templateLanguage: template_language,
        templateParams: template_params,
        templateMessageParams: template_message_params,
        interactivePayload: interactive_payload,
        replyToMessageId: reply_to_message_id,
      });

      return NextResponse.json({
        success: true,
        message_id: result.messageId,
        whatsapp_message_id: result.whatsappMessageId,
      });
    } catch (error) {
      if (error instanceof SendMessageError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Error in WhatsApp send POST:', error);
    return toErrorResponse(error);
  }
}

async function findOrCreateConversation(
  database: WhatsAppQueryDb,
  accountId: string,
  userId: string,
  contactId: string
): Promise<string | null> {
  const findExisting = async () => {
    const [row] = await database
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.accountId, accountId),
          eq(schema.conversations.contactId, contactId)
        )
      )
      .limit(1);
    return row?.id ?? null;
  };

  const existing = await findExisting();
  if (existing) return existing;

  const [created] = await database
    .insert(schema.conversations)
    .values({ accountId, userId, contactId })
    .onConflictDoNothing()
    .returning({ id: schema.conversations.id });

  return created?.id ?? (await findExisting());
}
