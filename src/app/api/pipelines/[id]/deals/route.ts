import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  badRequest,
  findAccountPipeline,
  notFound,
  readDealPayload,
  serverError,
  validateDealReferences,
} from '../../_shared';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('agent');
  } catch (error) {
    return toErrorResponse(error);
  }

  const { id } = await params;
  const payload = readDealPayload(await request.json().catch(() => null));
  if (!payload) return badRequest('Los datos del negocio no son válidos.');

  try {
    if (!(await findAccountPipeline(ctx, id))) return notFound();
    if (!(await validateDealReferences(ctx, id, payload))) {
      return badRequest('Contacto, etapa o responsable inválido.');
    }

    const [created] = await ctx.db
      .insert(schema.deals)
      .values({
        accountId: ctx.accountId,
        userId: ctx.userId,
        pipelineId: id,
        stageId: payload.stageId,
        contactId: payload.contactId,
        assignedTo: payload.assignedTo,
        title: payload.title,
        value: payload.value,
        currency: payload.currency,
        notes: payload.notes,
        expectedCloseDate: payload.expectedCloseDate,
        status: 'open',
      })
      .returning({ id: schema.deals.id });
    if (!created) throw new Error('Deal insert failed');
    return NextResponse.json({ deal: created }, { status: 201 });
  } catch (error) {
    return serverError(`${id}/deals/POST`, error);
  }
}
