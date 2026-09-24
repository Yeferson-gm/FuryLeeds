import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { findAccountPipeline, notFound, serverError } from '../../../_shared';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('admin');
  } catch (error) {
    return toErrorResponse(error);
  }

  const { id, stageId } = await params;
  try {
    if (!(await findAccountPipeline(ctx, id))) return notFound();
    const [deal] = await ctx.db
      .select({ id: schema.deals.id })
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.stageId, stageId),
          eq(schema.deals.pipelineId, id),
          eq(schema.deals.accountId, ctx.accountId)
        )
      )
      .limit(1);
    if (deal) {
      return NextResponse.json(
        { error: 'Primero mueve o elimina los negocios de esta etapa.' },
        { status: 409 }
      );
    }

    const deleted = await ctx.db
      .delete(schema.pipelineStages)
      .where(
        and(
          eq(schema.pipelineStages.id, stageId),
          eq(schema.pipelineStages.pipelineId, id)
        )
      )
      .returning({ id: schema.pipelineStages.id });
    if (!deleted[0]) return notFound();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(`${id}/stages/${stageId}/DELETE`, error);
  }
}
