import { randomUUID } from 'node:crypto';
import { and, arrayContains, eq, sql } from 'drizzle-orm';
import { type db as appDb, schema } from '@/lib/db';
import type { WebhookEvent } from '@/lib/webhooks/events';
import { buildSignatureHeader } from '@/lib/webhooks/sign';
import { isDeliverableUrl } from '@/lib/webhooks/ssrf';
import { decrypt } from '@/lib/whatsapp/encryption';

export const DELIVERY_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_FAILURES = 15;

type WebhookDatabase = Pick<typeof appDb, 'select' | 'update'>;

interface EndpointRow {
  id: string;
  accountId: string;
  url: string;
  secret: string;
}

export async function dispatchWebhookEvent(
  database: WebhookDatabase,
  accountId: string,
  event: WebhookEvent,
  data: unknown
): Promise<void> {
  try {
    const rows = await database
      .select({
        id: schema.webhookEndpoints.id,
        accountId: schema.webhookEndpoints.accountId,
        url: schema.webhookEndpoints.url,
        secret: schema.webhookEndpoints.secret,
      })
      .from(schema.webhookEndpoints)
      .where(
        and(
          eq(schema.webhookEndpoints.accountId, accountId),
          eq(schema.webhookEndpoints.isActive, true),
          arrayContains(schema.webhookEndpoints.events, [event])
        )
      );
    if (rows.length === 0) return;

    const payload = JSON.stringify({
      id: randomUUID(),
      event,
      occurred_at: new Date().toISOString(),
      account_id: accountId,
      data,
    });
    const tsSeconds = Math.floor(Date.now() / 1000);
    await Promise.allSettled(
      rows.map((row) => deliverOne(database, row, event, payload, tsSeconds))
    );
  } catch (error) {
    console.error('[webhooks] dispatch failed:', error);
  }
}

async function deliverOne(
  database: WebhookDatabase,
  row: EndpointRow,
  event: WebhookEvent,
  payload: string,
  tsSeconds: number
): Promise<void> {
  if (!(await isDeliverableUrl(row.url))) {
    console.warn('[webhooks] refusing non-public delivery target for', row.id);
    await recordFailure(database, row);
    return;
  }

  let secret: string;
  try {
    secret = decrypt(row.secret);
  } catch (error) {
    console.error('[webhooks] secret decrypt failed for', row.id, error);
    await recordFailure(database, row);
    return;
  }

  try {
    const response = await fetch(row.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FuryLeeds-Event': event,
        'X-FuryLeeds-Webhook-Id': row.id,
        'X-FuryLeeds-Signature': buildSignatureHeader(
          payload,
          secret,
          tsSeconds
        ),
      },
      body: payload,
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`endpoint responded ${response.status}`);

    await database
      .update(schema.webhookEndpoints)
      .set({ failureCount: 0, lastDeliveryAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.webhookEndpoints.id, row.id),
          eq(schema.webhookEndpoints.accountId, row.accountId)
        )
      );
  } catch (error) {
    console.warn(
      `[webhooks] delivery to ${row.id} failed:`,
      error instanceof Error ? error.message : error
    );
    await recordFailure(database, row);
  }
}

async function recordFailure(
  database: WebhookDatabase,
  row: EndpointRow
): Promise<void> {
  try {
    await database
      .update(schema.webhookEndpoints)
      .set({
        failureCount: sql`${schema.webhookEndpoints.failureCount} + 1`,
        isActive: sql`CASE
          WHEN ${schema.webhookEndpoints.failureCount} + 1 >= ${MAX_CONSECUTIVE_FAILURES}
          THEN false
          ELSE ${schema.webhookEndpoints.isActive}
        END`,
      })
      .where(
        and(
          eq(schema.webhookEndpoints.id, row.id),
          eq(schema.webhookEndpoints.accountId, row.accountId)
        )
      );
  } catch (error) {
    console.error('[webhooks] failure update failed for', row.id, error);
  }
}
