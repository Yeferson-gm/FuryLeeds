import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  badRequest,
  findAccountPipeline,
  notFound,
  serverError,
  toStage,
} from '../../_shared';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('admin');
  } catch (error) {
    return toErrorResponse(error);
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const color = typeof body?.color === 'string' ? body.color : '';
  const position = typeof body?.position === 'number' ? body.position : -1;
  if (
    !name ||
    name.length > 120 ||
    !/^#[0-9a-f]{6}$/i.test(color) ||
    !Number.isInteger(position) ||
    position < 0
  ) {
    return badRequest('Datos de etapa inválidos.');
  }

  try {
    if (!(await findAccountPipeline(ctx, id))) return notFound();
    const [created] = await ctx.db
      .insert(schema.pipelineStages)
      .values({ pipelineId: id, name, color, position })
      .returning();
    if (!created) throw new Error('Stage insert failed');
    return NextResponse.json({ stage: toStage(created) }, { status: 201 });
  } catch (error) {
    return serverError(`${id}/stages/POST`, error);
  }
}
