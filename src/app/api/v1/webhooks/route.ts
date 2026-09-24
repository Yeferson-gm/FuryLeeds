import { desc, eq } from 'drizzle-orm';
import { fail, ok, okList, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';
import { schema } from '@/lib/db';
import {
  generateWebhookSecret,
  normalizeWebhookUrl,
  serializeWebhookEndpoint,
  webhookPublicSelection,
} from '@/lib/webhooks/endpoints';
import { normalizeEvents } from '@/lib/webhooks/events';
import { encrypt } from '@/lib/whatsapp/encryption';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'webhooks:manage');
    const rows = await ctx.db
      .select(webhookPublicSelection())
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.accountId, ctx.accountId))
      .orderBy(desc(schema.webhookEndpoints.createdAt));
    return okList(
      rows.map((row) => serializeWebhookEndpoint(row)),
      null
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'webhooks:manage');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }
    const url = normalizeWebhookUrl(body.url);
    if (!url) {
      return fail('bad_request', "'url' must be a valid https:// URL", 400);
    }
    const events = normalizeEvents(body.events);
    if (!events) {
      return fail(
        'bad_request',
        "'events' must be a non-empty array of known event names",
        400
      );
    }

    const secret = generateWebhookSecret();
    const [created] = await ctx.db
      .insert(schema.webhookEndpoints)
      .values({
        accountId: ctx.accountId,
        createdBy: ctx.createdBy,
        url,
        secret: encrypt(secret),
        events,
      })
      .returning(webhookPublicSelection());
    if (!created) return fail('internal', 'Failed to create webhook', 500);
    return ok({ ...serializeWebhookEndpoint(created), secret }, 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
