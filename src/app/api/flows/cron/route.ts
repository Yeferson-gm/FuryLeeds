import { timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { resolveFallbackPolicy } from '@/lib/flows/fallback';

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const runs = await db
      .select({
        id: schema.flowRuns.id,
        accountId: schema.flowRuns.accountId,
        lastAdvancedAt: schema.flowRuns.lastAdvancedAt,
        fallbackPolicy: schema.flows.fallbackPolicy,
      })
      .from(schema.flowRuns)
      .innerJoin(
        schema.flows,
        and(
          eq(schema.flows.id, schema.flowRuns.flowId),
          eq(schema.flows.accountId, schema.flowRuns.accountId)
        )
      )
      .where(eq(schema.flowRuns.status, 'active'));

    let swept = 0;
    for (const run of runs) {
      const policy = resolveFallbackPolicy(run.fallbackPolicy);
      const ageHours =
        (now.getTime() - new Date(run.lastAdvancedAt).getTime()) / 3_600_000;
      if (ageHours < policy.on_timeout_hours) continue;

      const timedOut = await db.transaction(async (tx) => {
        const updated = await tx
          .update(schema.flowRuns)
          .set({
            status: 'timed_out',
            endedAt: now.toISOString(),
            endReason: 'stale_sweep',
          })
          .where(
            and(
              eq(schema.flowRuns.id, run.id),
              eq(schema.flowRuns.accountId, run.accountId),
              eq(schema.flowRuns.status, 'active')
            )
          )
          .returning({ id: schema.flowRuns.id });
        if (updated.length === 0) return false;
        await tx.insert(schema.flowRunEvents).values({
          flowRunId: run.id,
          eventType: 'timeout',
          payload: {
            age_hours: Math.round(ageHours * 10) / 10,
            policy_hours: policy.on_timeout_hours,
          },
        });
        return true;
      });
      if (timedOut) swept += 1;
    }
    return NextResponse.json({ swept });
  } catch (error) {
    console.error('[flows-cron] active-run sweep failed:', error);
    return NextResponse.json({ error: 'Flow sweep failed' }, { status: 500 });
  }
}
