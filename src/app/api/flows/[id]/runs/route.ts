import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { toFlowRunEventRow, toFlowRunRow } from '@/lib/flows/repository';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('viewer');
    const { id } = await context.params;
    const [flow] = await ctx.db
      .select({ id: schema.flows.id, name: schema.flows.name })
      .from(schema.flows)
      .where(
        and(eq(schema.flows.id, id), eq(schema.flows.accountId, ctx.accountId))
      )
      .limit(1);
    if (!flow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const rows = await ctx.db
      .select({
        run: schema.flowRuns,
        contact: {
          id: schema.contacts.id,
          name: schema.contacts.name,
          phone: schema.contacts.phone,
        },
      })
      .from(schema.flowRuns)
      .leftJoin(
        schema.contacts,
        and(
          eq(schema.contacts.id, schema.flowRuns.contactId),
          eq(schema.contacts.accountId, ctx.accountId)
        )
      )
      .where(
        and(
          eq(schema.flowRuns.flowId, id),
          eq(schema.flowRuns.accountId, ctx.accountId)
        )
      )
      .orderBy(desc(schema.flowRuns.startedAt))
      .limit(50);
    const runs = rows.map(({ run, contact }) => ({
      ...toFlowRunRow(run),
      contact,
    }));

    const runIds = rows.map(({ run }) => run.id);
    const eventRows =
      runIds.length === 0
        ? []
        : await ctx.db
            .select()
            .from(schema.flowRunEvents)
            .where(inArray(schema.flowRunEvents.flowRunId, runIds))
            .orderBy(asc(schema.flowRunEvents.createdAt));

    return NextResponse.json({
      flow,
      runs,
      events: eventRows.map(toFlowRunEventRow),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
