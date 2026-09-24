import { asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { badRequest, DEFAULT_STAGES, serverError, toPipeline } from './_shared';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const rows = await ctx.db
      .select()
      .from(schema.pipelines)
      .where(eq(schema.pipelines.accountId, ctx.accountId))
      .orderBy(asc(schema.pipelines.createdAt));
    return NextResponse.json({ pipelines: rows.map(toPipeline) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('admin');
  } catch (error) {
    return toErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
  } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) {
    return badRequest('El nombre debe tener entre 1 y 120 caracteres.');
  }

  try {
    const pipeline = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.pipelines)
        .values({ accountId: ctx.accountId, userId: ctx.userId, name })
        .returning();
      if (!created) throw new Error('Pipeline insert failed');
      await tx.insert(schema.pipelineStages).values(
        DEFAULT_STAGES.map((stage) => ({
          pipelineId: created.id,
          ...stage,
        }))
      );
      return created;
    });
    return NextResponse.json(
      { pipeline: toPipeline(pipeline) },
      { status: 201 }
    );
  } catch (error) {
    return serverError('POST', error);
  }
}
