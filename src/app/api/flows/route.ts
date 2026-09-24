import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { toFlowRow } from '@/lib/flows/repository';
import { getFlowTemplate } from '@/lib/flows/templates';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const rows = await ctx.db
      .select()
      .from(schema.flows)
      .where(eq(schema.flows.accountId, ctx.accountId))
      .orderBy(desc(schema.flows.createdAt));
    return NextResponse.json({ flows: rows.map(toFlowRow) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      description?: string | null;
      trigger_type?: 'keyword' | 'first_inbound_message' | 'manual';
      trigger_config?: Record<string, unknown>;
      template_slug?: string;
    } | null;
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (body.template_slug) {
      const template = getFlowTemplate(body.template_slug);
      if (!template) {
        return NextResponse.json(
          { error: `Unknown template_slug "${body.template_slug}"` },
          { status: 400 }
        );
      }

      const flow = await ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(schema.flows)
          .values({
            userId: ctx.userId,
            accountId: ctx.accountId,
            name: body.name?.trim() || template.name,
            description: template.description,
            status: 'draft',
            triggerType: template.trigger_type,
            triggerConfig: template.trigger_config,
            entryNodeId: template.entry_node_id,
          })
          .returning();
        if (!created) throw new Error('flow insert failed');

        if (template.nodes.length > 0) {
          await tx.insert(schema.flowNodes).values(
            template.nodes.map((node) => ({
              flowId: created.id,
              nodeKey: node.node_key,
              nodeType: node.node_type,
              config: node.config,
            }))
          );
        }
        return created;
      });
      return NextResponse.json({ flow: toFlowRow(flow) }, { status: 201 });
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const [created] = await ctx.db
      .insert(schema.flows)
      .values({
        userId: ctx.userId,
        accountId: ctx.accountId,
        name: body.name.trim(),
        description: body.description ?? null,
        status: 'draft',
        triggerType: body.trigger_type ?? 'keyword',
        triggerConfig: body.trigger_config ?? {},
      })
      .returning();
    if (!created) throw new Error('flow insert failed');
    return NextResponse.json({ flow: toFlowRow(created) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
