import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { toFlowNodeRow, toFlowRow } from '@/lib/flows/repository';

interface PutBody {
  name?: string;
  description?: string | null;
  trigger_type?: 'keyword' | 'first_inbound_message' | 'manual';
  trigger_config?: Record<string, unknown>;
  entry_node_id?: string | null;
  fallback_policy?: Record<string, unknown>;
  nodes?: Array<{
    node_key: string;
    node_type: string;
    config: Record<string, unknown>;
    position_x?: number;
    position_y?: number;
  }>;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('viewer');
    const { id } = await context.params;
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
    const nodes = await ctx.db
      .select()
      .from(schema.flowNodes)
      .where(eq(schema.flowNodes.flowId, flow.id))
      .orderBy(asc(schema.flowNodes.createdAt));
    return NextResponse.json({
      flow: toFlowRow(flow),
      nodes: nodes.map(toFlowNodeRow),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as PutBody | null;
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json(
        { error: 'name cannot be empty' },
        { status: 400 }
      );
    }

    const result = await ctx.db.transaction(async (tx) => {
      const patch: Partial<typeof schema.flows.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.description !== undefined) patch.description = body.description;
      if (body.trigger_type !== undefined)
        patch.triggerType = body.trigger_type;
      if (body.trigger_config !== undefined)
        patch.triggerConfig = body.trigger_config;
      if (body.entry_node_id !== undefined)
        patch.entryNodeId = body.entry_node_id;
      if (body.fallback_policy !== undefined)
        patch.fallbackPolicy = body.fallback_policy;

      const [updated] = await tx
        .update(schema.flows)
        .set(patch)
        .where(
          and(
            eq(schema.flows.id, id),
            eq(schema.flows.accountId, ctx.accountId)
          )
        )
        .returning();
      if (!updated) return null;

      if (body.nodes !== undefined) {
        await tx
          .delete(schema.flowNodes)
          .where(eq(schema.flowNodes.flowId, updated.id));
        if (body.nodes.length > 0) {
          await tx.insert(schema.flowNodes).values(
            body.nodes.map((node) => ({
              flowId: updated.id,
              nodeKey: node.node_key,
              nodeType: node.node_type,
              config: node.config,
              positionX: node.position_x ?? 0,
              positionY: node.position_y ?? 0,
            }))
          );
        }
      }

      const nodes = await tx
        .select()
        .from(schema.flowNodes)
        .where(eq(schema.flowNodes.flowId, updated.id))
        .orderBy(asc(schema.flowNodes.createdAt));
      return { flow: updated, nodes };
    });

    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({
      flow: toFlowRow(result.flow),
      nodes: result.nodes.map(toFlowNodeRow),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await context.params;
    const deleted = await ctx.db
      .delete(schema.flows)
      .where(
        and(eq(schema.flows.id, id), eq(schema.flows.accountId, ctx.accountId))
      )
      .returning({ id: schema.flows.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
