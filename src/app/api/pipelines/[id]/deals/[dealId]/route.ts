import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  badRequest,
  findAccountPipeline,
  isDealStatus,
  notFound,
  readDealPayload,
  serverError,
  validateDealReferences,
} from '../../../_shared';

interface RouteContext {
  params: Promise<{ id: string; dealId: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('agent');
  } catch (error) {
    return toErrorResponse(error);
  }

  const [{ id, dealId }, body] = await Promise.all([
    params,
    request.json().catch(() => null),
  ]);
  if (!body || typeof body !== 'object') return badRequest('JSON inválido.');

  try {
    if (!(await findAccountPipeline(ctx, id))) return notFound();

    const input = body as Record<string, unknown>;
    let update: Partial<typeof schema.deals.$inferInsert>;
    if (Object.keys(input).length === 1 && 'stage_id' in input) {
      const stageId = typeof input.stage_id === 'string' ? input.stage_id : '';
      if (!stageId) return badRequest('La etapa es obligatoria.');
      const [stage] = await ctx.db
        .select({ id: schema.pipelineStages.id })
        .from(schema.pipelineStages)
        .where(
          and(
            eq(schema.pipelineStages.id, stageId),
            eq(schema.pipelineStages.pipelineId, id)
          )
        )
        .limit(1);
      if (!stage) return badRequest('La etapa no pertenece al pipeline.');
      update = { stageId };
    } else if (Object.keys(input).length === 1 && 'status' in input) {
      if (!isDealStatus(input.status)) return badRequest('Estado inválido.');
      update = { status: input.status };
    } else {
      const payload = readDealPayload(input);
      if (!payload) return badRequest('Los datos del negocio no son válidos.');
      if (!(await validateDealReferences(ctx, id, payload))) {
        return badRequest('Contacto, etapa o responsable inválido.');
      }
      update = {
        stageId: payload.stageId,
        contactId: payload.contactId,
        assignedTo: payload.assignedTo,
        title: payload.title,
        value: payload.value,
        currency: payload.currency,
        notes: payload.notes,
        expectedCloseDate: payload.expectedCloseDate,
      };
    }

    const updated = await ctx.db
      .update(schema.deals)
      .set({ ...update, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.deals.id, dealId),
          eq(schema.deals.pipelineId, id),
          eq(schema.deals.accountId, ctx.accountId)
        )
      )
      .returning({ id: schema.deals.id });
    if (!updated[0]) return notFound();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(`${id}/deals/${dealId}/PATCH`, error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('agent');
    const { id, dealId } = await params;
    const deleted = await ctx.db
      .delete(schema.deals)
      .where(
        and(
          eq(schema.deals.id, dealId),
          eq(schema.deals.pipelineId, id),
          eq(schema.deals.accountId, ctx.accountId)
        )
      )
      .returning({ id: schema.deals.id });
    if (!deleted[0]) return notFound();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
