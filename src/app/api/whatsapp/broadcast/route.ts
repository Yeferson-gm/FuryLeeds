import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  isValidE164,
  phoneVariants,
  sanitizePhoneForMeta,
} from '@/lib/whatsapp/phone-utils';
import { resolveTemplateRow } from '@/lib/whatsapp/template-body';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import type { Broadcast } from '@/types';

function toBroadcast(row: typeof schema.broadcasts.$inferSelect): Broadcast {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    template_name: row.templateName,
    template_language: row.templateLanguage,
    template_variables: row.templateVariables as
      | Record<string, unknown>
      | undefined,
    audience_filter: row.audienceFilter as Record<string, unknown> | undefined,
    scheduled_at: row.scheduledAt ?? undefined,
    status: row.status as Broadcast['status'],
    total_recipients: row.totalRecipients ?? 0,
    sent_count: row.sentCount ?? 0,
    delivered_count: row.deliveredCount ?? 0,
    read_count: row.readCount ?? 0,
    replied_count: row.repliedCount ?? 0,
    failed_count: row.failedCount ?? 0,
    delivery_locked_at: row.deliveryLockedAt,
    created_at: row.createdAt ?? '',
  };
}

export async function GET() {
  try {
    const { db, accountId } = await requireRole('viewer');
    const rows = await db
      .select()
      .from(schema.broadcasts)
      .where(eq(schema.broadcasts.accountId, accountId))
      .orderBy(desc(schema.broadcasts.createdAt));
    return NextResponse.json({ broadcasts: rows.map(toBroadcast) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

interface BroadcastResult {
  phone: string;
  status: 'sent' | 'failed';
  whatsapp_message_id?: string;
  error?: string;
}

interface BroadcastRecipientInput {
  phone: string;
  /** Body variable values, one per {{N}}. */
  params?: string[];
  /**
   * Structured per-send values (header text variable, media URL
   * override, URL/COPY_CODE button values). When set, takes
   * precedence over `params` for the body too — see
   * sendTemplateMessage for the merge rules.
   */
  messageParams?: SendTimeParams;
}

export async function POST(request: Request) {
  try {
    // Broadcasts are external side effects, so authorization must happen
    // before reading credentials or contacting Meta.
    const { db, accountId, userId } = await requireRole('agent');

    // Per-user broadcast budget. Note: this limits how often a user
    // can *start* a campaign, not how many messages go out inside
    // one — the fan-out loop below runs without additional gating.
    const limit = checkRateLimit(`broadcast:${userId}`, RATE_LIMITS.broadcast);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json(
        { error: 'El cuerpo debe ser un objeto JSON válido' },
        { status: 400 }
      );
    }

    const { recipients, template_name, template_language } = body as {
      recipients?: BroadcastRecipientInput[];
      template_name?: string;
      template_language?: string;
    };

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: '`recipients` debe ser un arreglo no vacío' },
        { status: 400 }
      );
    }
    if (
      recipients.some(
        (recipient) =>
          !recipient ||
          typeof recipient !== 'object' ||
          typeof recipient.phone !== 'string' ||
          (recipient.params !== undefined &&
            (!Array.isArray(recipient.params) ||
              recipient.params.some((param) => typeof param !== 'string')))
      )
    ) {
      return NextResponse.json(
        { error: 'Cada destinatario debe incluir un teléfono válido' },
        { status: 400 }
      );
    }

    if (typeof template_name !== 'string' || !template_name.trim()) {
      return NextResponse.json(
        { error: 'El campo template_name es obligatorio' },
        { status: 400 }
      );
    }

    const [config] = await db
      .select()
      .from(schema.whatsappConfig)
      .where(eq(schema.whatsappConfig.accountId, accountId))
      .limit(1);

    if (!config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp no está configurado. Primero configura la integración con WhatsApp.',
        },
        { status: 400 }
      );
    }

    const accessToken = decrypt(config.accessToken);

    // Load the template row once so sendTemplateMessage can build
    // header + button components on each iteration.
    // Guard against a malformed local row crashing every send in
    // the loop with the same opaque TypeError — fail loudly once.
    const resolvedTemplate = await resolveTemplateRow(
      db,
      accountId,
      template_name,
      template_language
    );
    if (resolvedTemplate.malformed) {
      return NextResponse.json(
        {
          error:
            'La plantilla local tiene un formato incorrecto. Ejecuta "Sincronizar desde Meta" en Configuración para repararla antes de enviar la difusión.',
        },
        { status: 500 }
      );
    }
    const templateRow = resolvedTemplate.row;

    const results: BroadcastResult[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      const sanitized = sanitizePhoneForMeta(recipient.phone);

      if (!isValidE164(sanitized)) {
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: 'Formato de número de teléfono no válido',
        });
        failedCount++;
        continue;
      }

      // Retry with phone variants on "not in allowed list" so numbers
      // that differ only in a trunk-prefix 0 still reach recipients.
      const variants = phoneVariants(sanitized);
      let sentMessageId: string | null = null;
      let lastError: string | null = null;

      for (const variant of variants) {
        try {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phoneNumberId,
            accessToken,
            to: variant,
            templateName: template_name,
            language: resolvedTemplate.language,
            template: templateRow ?? undefined,
            messageParams: recipient.messageParams,
            bodyParams: recipient.params ?? [],
          });
          sentMessageId = result.messageId;
          lastError = null;
          break;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Error desconocido';
          if (!isRecipientNotAllowedError(errorMessage)) {
            lastError = errorMessage;
            break;
          }
          lastError = errorMessage;
          // retry with next variant
        }
      }

      if (sentMessageId) {
        results.push({
          phone: recipient.phone,
          status: 'sent',
          whatsapp_message_id: sentMessageId,
        });
        sentCount++;
      } else {
        console.error(
          `Failed to send broadcast to ${recipient.phone}:`,
          lastError
        );
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: lastError || 'Error desconocido',
        });
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    // requireRole throws Unauthorized/Forbidden; toErrorResponse maps
    // those to 401/403 and collapses anything else to a generic 500.
    console.error('Error in WhatsApp broadcast POST:', error);
    return toErrorResponse(error);
  }
}
