import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendReactionMessage } from '@/lib/whatsapp/meta-api';
import { resolveContactSendTarget } from '@/lib/whatsapp/wa-identity';

export async function POST(request: Request) {
  try {
    const { db, accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(`react:${userId}`, RATE_LIMITS.react);
    if (!limit.success) return rateLimitResponse(limit);

    const { message_id, emoji } = (await request.json()) as {
      message_id?: string;
      emoji?: string;
    };
    if (!message_id || typeof emoji !== 'string') {
      return NextResponse.json(
        { error: 'Los campos message_id y emoji son obligatorios' },
        { status: 400 }
      );
    }

    const [target] = await db
      .select({
        id: schema.messages.id,
        metaMessageId: schema.messages.messageId,
        conversationId: schema.messages.conversationId,
        phone: schema.contacts.phone,
        waUserId: schema.contacts.waUserId,
      })
      .from(schema.messages)
      .innerJoin(
        schema.conversations,
        eq(schema.conversations.id, schema.messages.conversationId)
      )
      .innerJoin(
        schema.contacts,
        eq(schema.contacts.id, schema.conversations.contactId)
      )
      .where(
        and(
          eq(schema.messages.id, message_id),
          eq(schema.conversations.accountId, accountId)
        )
      )
      .limit(1);

    if (!target) {
      return NextResponse.json(
        { error: 'No se encontró el mensaje' },
        { status: 404 }
      );
    }
    if (!target.metaMessageId) {
      return NextResponse.json(
        {
          error:
            'No se puede reaccionar a un mensaje que no se ha enviado a WhatsApp',
        },
        { status: 400 }
      );
    }

    const sendTarget = resolveContactSendTarget({
      phone: target.phone,
      wa_user_id: target.waUserId,
    });
    if (!sendTarget) {
      return NextResponse.json(
        {
          error:
            'El contacto no tiene número de teléfono ni ID de usuario de WhatsApp',
        },
        { status: 400 }
      );
    }

    const [config] = await db
      .select({
        phoneNumberId: schema.whatsappConfig.phoneNumberId,
        accessToken: schema.whatsappConfig.accessToken,
      })
      .from(schema.whatsappConfig)
      .where(eq(schema.whatsappConfig.accountId, accountId))
      .limit(1);
    if (!config) {
      return NextResponse.json(
        { error: 'WhatsApp no está configurado.' },
        { status: 400 }
      );
    }

    try {
      await sendReactionMessage({
        phoneNumberId: config.phoneNumberId,
        accessToken: decrypt(config.accessToken),
        to: sendTarget.target,
        targetMessageId: target.metaMessageId,
        emoji,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido de la API de Meta';
      console.error('[whatsapp/react] Meta send failed:', message);
      return NextResponse.json(
        { error: `Error de la API de Meta: ${message}` },
        { status: 502 }
      );
    }

    try {
      if (emoji === '') {
        await db
          .delete(schema.messageReactions)
          .where(
            and(
              eq(schema.messageReactions.messageId, target.id),
              eq(schema.messageReactions.actorType, 'agent'),
              eq(schema.messageReactions.actorId, userId)
            )
          );
      } else {
        await db
          .insert(schema.messageReactions)
          .values({
            messageId: target.id,
            conversationId: target.conversationId,
            actorType: 'agent',
            actorId: userId,
            emoji,
          })
          .onConflictDoUpdate({
            target: [
              schema.messageReactions.actorId,
              schema.messageReactions.actorType,
              schema.messageReactions.messageId,
            ],
            set: { emoji },
          });
      }
    } catch (error) {
      console.error('[whatsapp/react] DB mirror failed:', error);
      return NextResponse.json(
        {
          error:
            emoji === ''
              ? 'La reacción se envió a Meta, pero no se pudo eliminar de la base de datos'
              : 'La reacción se envió a Meta, pero no se pudo guardar en la base de datos',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in WhatsApp react POST:', error);
    return toErrorResponse(error);
  }
}
