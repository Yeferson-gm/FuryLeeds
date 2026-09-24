import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { AutomationContext } from '@/lib/automations/engine';
import { resumePendingExecution } from '@/lib/automations/engine';
import { sqlClient } from '@/lib/db';

interface PendingRow {
  id: string;
  automation_id: string;
  account_id: string;
  user_id: string;
  contact_id: string | null;
  log_id: string | null;
  parent_step_id: string | null;
  branch: 'yes' | 'no' | null;
  next_step_position: number;
  context: AutomationContext;
}

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
    // Claim the batch atomically. SKIP LOCKED lets overlapping cron requests
    // drain different rows without processing the same execution twice.
    const due = await sqlClient.begin(
      async (transaction) =>
        transaction<PendingRow[]>`
        UPDATE automation_pending_executions AS pending
        SET status = 'running'
        FROM (
          SELECT id
          FROM automation_pending_executions
          WHERE status = 'pending' AND run_at <= NOW()
          ORDER BY run_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 50
        ) AS claim
        WHERE pending.id = claim.id
        RETURNING
          pending.id,
          pending.automation_id,
          pending.account_id,
          pending.user_id,
          pending.contact_id,
          pending.log_id,
          pending.parent_step_id,
          pending.branch,
          pending.next_step_position,
          pending.context
      `
    );

    for (const row of due) {
      await resumePendingExecution({
        ...row,
        context: row.context ?? {},
      });
    }
    return NextResponse.json({ processed: due.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'cron failed' },
      { status: 500 }
    );
  }
}
