import { and, eq } from 'drizzle-orm';
import { fail, ok, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';
import { schema } from '@/lib/db';
import {
  normalizeWebhookUrl,
  serializeWebhookEndpoint,
  webhookPublicSelection,
} from '@/lib/webhooks/endpoints';
import { normalizeEvents } from '@/lib/webhooks/events';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'webhooks:manage');
    const { id } = await params;
    const [row] = await ctx.db
      .select(webhookPublicSelection())
      .from(schema.webhookEndpoints)
      .where(
        and(
          eq(schema.webhookEndpoints.id, id),
          eq(schema.webhookEndpoints.accountId, ctx.accountId)
        )
      )
      .limit(1);
    if (!row) return fail('not_found', 'No se encontró el webhook', 404);
    return ok(serializeWebhookEndpoint(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'webhooks:manage');
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail(
        'bad_request',
        'El cuerpo de la solicitud debe ser un objeto JSON',
        400
      );
    }

    const updates: {
      url?: string;
      events?: string[];
      isActive?: boolean;
      failureCount?: number;
    } = {};
    if ('url' in body) {
      const url = normalizeWebhookUrl(body.url);
      if (!url) {
        return fail(
          'bad_request',
          "'url' debe ser una URL https:// válida",
          400
        );
      }
      updates.url = url;
    }
    if ('events' in body) {
      const events = normalizeEvents(body.events);
      if (!events) {
        return fail(
          'bad_request',
          "'events' debe ser un arreglo no vacío de nombres de eventos conocidos",
          400
        );
      }
      updates.events = events;
    }
    if ('is_active' in body) {
      if (typeof body.is_active !== 'boolean') {
        return fail('bad_request', "'is_active' debe ser un booleano", 400);
      }
      updates.isActive = body.is_active;
      if (body.is_active) updates.failureCount = 0;
    }
    if (Object.keys(updates).length === 0) {
      return fail(
        'bad_request',
        'No se proporcionaron campos actualizables',
        400
      );
    }

    const [updated] = await ctx.db
      .update(schema.webhookEndpoints)
      .set(updates)
      .where(
        and(
          eq(schema.webhookEndpoints.id, id),
          eq(schema.webhookEndpoints.accountId, ctx.accountId)
        )
      )
      .returning(webhookPublicSelection());
    if (!updated) return fail('not_found', 'No se encontró el webhook', 404);
    return ok(serializeWebhookEndpoint(updated));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'webhooks:manage');
    const { id } = await params;
    const [deleted] = await ctx.db
      .delete(schema.webhookEndpoints)
      .where(
        and(
          eq(schema.webhookEndpoints.id, id),
          eq(schema.webhookEndpoints.accountId, ctx.accountId)
        )
      )
      .returning({ id: schema.webhookEndpoints.id });
    if (!deleted) return fail('not_found', 'No se encontró el webhook', 404);
    return ok({ id: deleted.id, deleted: true });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
