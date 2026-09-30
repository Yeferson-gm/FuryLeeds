import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  ForbiddenError,
  requireRole,
  toErrorResponse,
  UnauthorizedError,
} from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { toMessageTemplate, type WhatsAppQueryDb } from '@/lib/whatsapp/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import { MetaApiError, submitMessageTemplate } from '@/lib/whatsapp/meta-api';
import { buildMetaTemplatePayload } from '@/lib/whatsapp/template-components';
import { ensureMediaHeaderHandle } from '@/lib/whatsapp/template-header-handle';
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize';
import {
  type TemplatePayload,
  validateTemplatePayload,
} from '@/lib/whatsapp/template-validators';

/**
 * Shared upsert payload builder — both the Meta-failure path and the
 * Meta-success path write nearly identical rows; dropping the shared
 * fields here means adding a column later only touches one spot.
 */
function buildUpsertRow(
  accountId: string,
  userId: string,
  payload: TemplatePayload,
  extras: {
    status: 'DRAFT' | string;
    metaTemplateId: string | null;
    submissionError: string | null;
  }
) {
  return {
    // Account tenancy — required NOT NULL on message_templates as
    // of migration 017. Without this an INSERT throws on the
    // not-null constraint.
    accountId,
    // Original author — kept as audit only. The unique index is
    // still on (user_id, name, language) — see the upsert helper
    // for the cross-teammate dedup follow-up.
    userId,
    name: payload.name,
    category: payload.category,
    language: payload.language,
    headerType: payload.header_type ?? null,
    headerContent: payload.header_content ?? null,
    headerMediaUrl: payload.header_media_url ?? null,
    headerHandle: payload.header_handle ?? null,
    bodyText: payload.body_text,
    footerText: payload.footer_text ?? null,
    buttons: payload.buttons ?? null,
    sampleValues: payload.sample_values ?? null,
    status: extras.status,
    metaTemplateId: extras.metaTemplateId,
    submissionError: extras.submissionError,
    // Clear stale rejection_reason whenever we re-submit; the
    // webhook will set it again if Meta still rejects.
    rejectionReason: null,
    lastSubmittedAt: new Date().toISOString(),
  };
}

async function upsertTemplateRow(
  database: WhatsAppQueryDb,
  row: ReturnType<typeof buildUpsertRow>
) {
  const [saved] = await database
    .insert(schema.messageTemplates)
    .values(row)
    .onConflictDoUpdate({
      target: [
        schema.messageTemplates.userId,
        schema.messageTemplates.name,
        schema.messageTemplates.language,
      ],
      set: row,
    })
    .returning();
  if (!saved) throw new Error('Template upsert returned no row');
  return saved;
}

/**
 * Submit a template to Meta for approval AND persist it locally.
 *
 * Auth → fetch whatsapp_config → validate → (DRY_RUN short-circuit) →
 * POST to Meta → upsert local row by (user_id, name, language) with
 * status, meta_template_id, sample_values, last_submitted_at.
 *
 * When WHATSAPP_TEMPLATES_DRY_RUN=true, we skip the network call and
 * insert a row with a synthetic `dry-run-<uuid>` meta_template_id so
 * CI / local dev can exercise the full UI without a real Meta App.
 *
 * On the Meta side this is a one-way trip — a row can only be
 * submitted; editing or deleting requires hsm_id and lives in PR 4.
 */
export async function POST(request: Request) {
  try {
    // Template submission changes account-wide settings and contacts Meta,
    // so require an administrator before performing any external side effect.
    const { db, accountId, userId } = await requireRole('admin');

    let payload: TemplatePayload;
    try {
      payload = (await request.json()) as TemplatePayload;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    if (payload.category === 'Authentication') {
      return NextResponse.json(
        {
          error:
            'AUTHENTICATION templates are not yet supported here — create them in Meta WhatsApp Manager and use "Sync from Meta".',
        },
        { status: 400 }
      );
    }

    try {
      validateTemplatePayload(payload);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Validation failed.' },
        { status: 400 }
      );
    }

    const dryRun =
      process.env.WHATSAPP_TEMPLATES_DRY_RUN === 'true' ||
      process.env.WHATSAPP_TEMPLATES_DRY_RUN === '1';

    let metaTemplateId: string;
    let metaStatus: string;

    if (dryRun) {
      metaTemplateId = `dry-run-${crypto.randomUUID()}`;
      metaStatus = 'PENDING';
    } else {
      const [config] = await db
        .select()
        .from(schema.whatsappConfig)
        .where(eq(schema.whatsappConfig.accountId, accountId))
        .limit(1);
      if (!config) {
        return NextResponse.json(
          {
            error:
              'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
          },
          { status: 400 }
        );
      }
      if (!config.wabaId) {
        return NextResponse.json(
          {
            error:
              'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
          },
          { status: 400 }
        );
      }

      const accessToken = decrypt(config.accessToken);

      // Media headers (image/video/document) need a Resumable-Upload
      // handle (Meta rejects a plain URL at creation). Derive it from
      // header_media_url before building the payload. Surfaces a 400 with
      // an actionable message (missing META_APP_ID, unreachable URL,
      // wrong type/size).
      try {
        await ensureMediaHeaderHandle(payload, accessToken);
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error ? e.message : 'Header media upload failed.',
          },
          { status: 400 }
        );
      }

      const metaPayload = buildMetaTemplatePayload(payload);
      try {
        const meta = await submitMessageTemplate({
          wabaId: config.wabaId,
          accessToken,
          payload: metaPayload,
        });
        metaTemplateId = meta.id;
        metaStatus = meta.status;
      } catch (e) {
        const baseMessage =
          e instanceof Error ? e.message : 'Meta submit failed.';
        const details =
          e instanceof MetaApiError && e.details?.trim()
            ? e.details.trim()
            : null;
        const message =
          details && !baseMessage.includes(details)
            ? `${baseMessage}: ${details}`
            : baseMessage;
        // Persist the failure so the user can retry; row stays DRAFT
        // until they fix and re-submit.
        await upsertTemplateRow(
          db,
          buildUpsertRow(accountId, userId, payload, {
            status: 'DRAFT',
            metaTemplateId: null,
            submissionError: message,
          })
        );
        const isRateLimit =
          (e instanceof MetaApiError && e.httpStatus === 429) ||
          /\b429\b/.test(message);
        return NextResponse.json(
          {
            error: isRateLimit
              ? 'Meta rate limit hit (100 template creates per hour). Try again later.'
              : message,
            meta:
              e instanceof MetaApiError
                ? {
                    code: e.code,
                    subcode: e.subcode,
                    fbtrace_id: e.fbtraceId,
                  }
                : undefined,
          },
          // Use 424 instead of 502 for a completed request that Meta rejected.
          // Some reverse proxies replace 502 bodies with an HTML gateway page,
          // which hides Meta's actionable JSON error from the dashboard.
          { status: isRateLimit ? 429 : 424 }
        );
      }
    }

    const row = await upsertTemplateRow(
      db,
      buildUpsertRow(accountId, userId, payload, {
        status: normalizeStatus(metaStatus),
        metaTemplateId,
        submissionError: null,
      })
    );

    return NextResponse.json({
      success: true,
      template: toMessageTemplate(row),
      dry_run: dryRun,
    });
  } catch (error) {
    // Auth failures map to 401/403. Handled before the generic branch
    // below, which surfaces `error.message` as a 500 — reporting "you
    // aren't an admin" as a template submission failure would send the
    // user chasing the wrong problem.
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error);
    }
    console.error('Error submitting template:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to submit template.',
      },
      { status: 500 }
    );
  }
}
