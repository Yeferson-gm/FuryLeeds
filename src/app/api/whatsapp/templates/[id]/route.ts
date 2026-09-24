import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  ForbiddenError,
  requireRole,
  toErrorResponse,
  UnauthorizedError,
} from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { toMessageTemplate } from '@/lib/whatsapp/db';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  deleteMessageTemplate,
  editMessageTemplate,
} from '@/lib/whatsapp/meta-api';
import { buildMetaTemplatePayload } from '@/lib/whatsapp/template-components';
import { ensureMediaHeaderHandle } from '@/lib/whatsapp/template-header-handle';
import {
  type TemplatePayload,
  validateTemplatePayload,
} from '@/lib/whatsapp/template-validators';

const EDITABLE_STATUSES = new Set(['APPROVED', 'REJECTED', 'PAUSED']);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDryRun(): boolean {
  return (
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === 'true' ||
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === '1'
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 }
      );
    }

    const { db, accountId } = await requireRole('admin');
    let payload: TemplatePayload;
    try {
      payload = (await request.json()) as TemplatePayload;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(schema.messageTemplates)
      .where(
        and(
          eq(schema.messageTemplates.id, id),
          eq(schema.messageTemplates.accountId, accountId)
        )
      )
      .limit(1);
    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found.' },
        { status: 404 }
      );
    }
    if (!existing.metaTemplateId) {
      return NextResponse.json(
        {
          error:
            'This template was never submitted to Meta — use New Template to submit it instead.',
        },
        { status: 400 }
      );
    }
    if (!EDITABLE_STATUSES.has(existing.status ?? '')) {
      return NextResponse.json(
        {
          error: `Templates in status ${existing.status} cannot be edited. Allowed: APPROVED, REJECTED, PAUSED.`,
        },
        { status: 400 }
      );
    }
    if (payload.category === 'Authentication') {
      return NextResponse.json(
        {
          error:
            'AUTHENTICATION templates are not editable here — manage them in Meta WhatsApp Manager.',
        },
        { status: 400 }
      );
    }

    try {
      validateTemplatePayload(payload);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Validation failed.',
        },
        { status: 400 }
      );
    }

    if (!isDryRun()) {
      const [config] = await db
        .select({ accessToken: schema.whatsappConfig.accessToken })
        .from(schema.whatsappConfig)
        .where(eq(schema.whatsappConfig.accountId, accountId))
        .limit(1);
      if (!config) {
        return NextResponse.json(
          { error: 'WhatsApp not configured.' },
          { status: 400 }
        );
      }
      const accessToken = decrypt(config.accessToken);

      try {
        await ensureMediaHeaderHandle(payload, accessToken);
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'Header media upload failed.',
          },
          { status: 400 }
        );
      }

      try {
        const metaPayload = buildMetaTemplatePayload(payload);
        await editMessageTemplate({
          metaTemplateId: existing.metaTemplateId,
          accessToken,
          components: metaPayload.components,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Meta edit failed.';
        await db
          .update(schema.messageTemplates)
          .set({
            submissionError: message,
            lastSubmittedAt: new Date().toISOString(),
          })
          .where(eq(schema.messageTemplates.id, id));
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    const [row] = await db
      .update(schema.messageTemplates)
      .set({
        category: payload.category,
        headerType: payload.header_type ?? null,
        headerContent: payload.header_content ?? null,
        headerMediaUrl: payload.header_media_url ?? null,
        headerHandle: payload.header_handle ?? null,
        bodyText: payload.body_text,
        footerText: payload.footer_text ?? null,
        buttons: payload.buttons ?? null,
        sampleValues: payload.sample_values ?? null,
        status: 'PENDING',
        submissionError: null,
        rejectionReason: null,
        lastSubmittedAt: new Date().toISOString(),
      })
      .where(eq(schema.messageTemplates.id, id))
      .returning();
    if (!row) {
      return NextResponse.json(
        {
          error:
            'Edited on Meta but failed to save locally. Run "Sync from Meta" to recover.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template: toMessageTemplate(row),
      dry_run: isDryRun(),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error);
    }
    console.error('Error editing template:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to edit template.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 }
      );
    }

    const { db, accountId } = await requireRole('admin');
    const [existing] = await db
      .select({
        id: schema.messageTemplates.id,
        name: schema.messageTemplates.name,
        metaTemplateId: schema.messageTemplates.metaTemplateId,
      })
      .from(schema.messageTemplates)
      .where(
        and(
          eq(schema.messageTemplates.id, id),
          eq(schema.messageTemplates.accountId, accountId)
        )
      )
      .limit(1);
    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found.' },
        { status: 404 }
      );
    }

    if (existing.metaTemplateId && !isDryRun()) {
      const [config] = await db
        .select({
          accessToken: schema.whatsappConfig.accessToken,
          wabaId: schema.whatsappConfig.wabaId,
        })
        .from(schema.whatsappConfig)
        .where(eq(schema.whatsappConfig.accountId, accountId))
        .limit(1);
      if (!config?.wabaId) {
        return NextResponse.json(
          { error: 'WhatsApp not configured — cannot delete on Meta.' },
          { status: 400 }
        );
      }

      try {
        await deleteMessageTemplate({
          wabaId: config.wabaId,
          accessToken: decrypt(config.accessToken),
          name: existing.name,
          metaTemplateId: existing.metaTemplateId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Meta delete failed.';
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    await db
      .delete(schema.messageTemplates)
      .where(eq(schema.messageTemplates.id, id));
    return NextResponse.json({ success: true, dry_run: isDryRun() });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error);
    }
    console.error('Error deleting template:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to delete template.',
      },
      { status: 500 }
    );
  }
}
