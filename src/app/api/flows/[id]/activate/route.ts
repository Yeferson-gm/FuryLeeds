import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { toFlowRow } from '@/lib/flows/repository';
import { validateFlowForActivation } from '@/lib/flows/validate';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      status?: 'draft' | 'active' | 'archived';
    } | null;
    const status = body?.status;
    if (!status || !['draft', 'active', 'archived'].includes(status)) {
      return NextResponse.json(
        { error: "status must be one of 'draft' | 'active' | 'archived'" },
        { status: 400 }
      );
    }

    const [flow] = await ctx.db
      .select()
      .from(schema.flows)
      .where(
        and(eq(schema.flows.id, id), eq(schema.flows.accountId, ctx.accountId))
      )
      .limit(1);
    if (!flow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (status === 'active') {
      const nodes = await ctx.db
        .select({
          node_key: schema.flowNodes.nodeKey,
          node_type: schema.flowNodes.nodeType,
          config: schema.flowNodes.config,
        })
        .from(schema.flowNodes)
        .where(eq(schema.flowNodes.flowId, flow.id));
      const issues = validateFlowForActivation(
        {
          name: flow.name,
          trigger_type: flow.triggerType as
            | 'keyword'
            | 'first_inbound_message'
            | 'manual',
          trigger_config: flow.triggerConfig as Record<string, unknown>,
          entry_node_id: flow.entryNodeId,
        },
        nodes as Array<{
          node_key: string;
          node_type: string;
          config: Record<string, unknown>;
        }>
      );
      if (issues.some((issue) => issue.severity === 'error')) {
        return NextResponse.json(
          {
            error: 'Cannot activate flow — fix the issues below first.',
            issues,
          },
          { status: 422 }
        );
      }
    }

    const [updated] = await ctx.db
      .update(schema.flows)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(
        and(eq(schema.flows.id, id), eq(schema.flows.accountId, ctx.accountId))
      )
      .returning();
    return NextResponse.json({ flow: updated ? toFlowRow(updated) : null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
