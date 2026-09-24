import { and, asc, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  badRequest,
  findAccountPipeline,
  notFound,
  serverError,
  toStage,
} from '../_shared';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('viewer');
    const { id } = await params;
    const pipeline = await findAccountPipeline(ctx, id);
    if (!pipeline) return notFound();

    const [stageRows, dealRows] = await Promise.all([
      ctx.db
        .select()
        .from(schema.pipelineStages)
        .where(eq(schema.pipelineStages.pipelineId, id))
        .orderBy(asc(schema.pipelineStages.position)),
      ctx.db
        .select({
          deal: schema.deals,
          contact: schema.contacts,
          assignee: schema.profiles,
        })
        .from(schema.deals)
        .leftJoin(
          schema.contacts,
          and(
            eq(schema.contacts.id, schema.deals.contactId),
            eq(schema.contacts.accountId, ctx.accountId)
          )
        )
        .leftJoin(
          schema.profiles,
          and(
            eq(schema.profiles.id, schema.deals.assignedTo),
            eq(schema.profiles.accountId, ctx.accountId)
          )
        )
        .where(
          and(
            eq(schema.deals.pipelineId, id),
            eq(schema.deals.accountId, ctx.accountId)
          )
        )
        .orderBy(desc(schema.deals.createdAt)),
    ]);

    return NextResponse.json({
      stages: stageRows.map(toStage),
      deals: dealRows.map(({ deal, contact, assignee }) => ({
        id: deal.id,
        user_id: deal.userId,
        pipeline_id: deal.pipelineId,
        stage_id: deal.stageId,
        contact_id: deal.contactId,
        conversation_id: deal.conversationId ?? undefined,
        assigned_to: deal.assignedTo ?? undefined,
        title: deal.title,
        value: Number(deal.value),
        currency: deal.currency ?? undefined,
        notes: deal.notes ?? undefined,
        expected_close_date: deal.expectedCloseDate ?? undefined,
        status: deal.status ?? 'open',
        created_at: deal.createdAt ?? '',
        updated_at: deal.updatedAt ?? undefined,
        contact: contact
          ? {
              id: contact.id,
              user_id: contact.userId,
              account_id: contact.accountId,
              phone: contact.phone,
              name: contact.name ?? undefined,
              email: contact.email ?? undefined,
              company: contact.company ?? undefined,
              avatar_url: contact.avatarUrl ?? undefined,
              created_at: contact.createdAt ?? '',
              updated_at: contact.updatedAt ?? '',
            }
          : undefined,
        assignee: assignee
          ? {
              id: assignee.id,
              user_id: assignee.userId,
              full_name: assignee.fullName,
              email: assignee.email,
              avatar_url: assignee.avatarUrl ?? undefined,
              account_id: assignee.accountId,
              account_role: assignee.accountRole,
              created_at: assignee.createdAt ?? '',
            }
          : undefined,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('admin');
  } catch (error) {
    return toErrorResponse(error);
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    stages?: unknown;
  } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120 || !Array.isArray(body?.stages)) {
    return badRequest('Nombre y etapas válidas son obligatorios.');
  }

  const stages = body.stages.map((stage, position) => {
    const value = stage as Record<string, unknown>;
    return {
      id: typeof value.id === 'string' ? value.id : '',
      name: typeof value.name === 'string' ? value.name.trim() : '',
      color: typeof value.color === 'string' ? value.color : '',
      position,
    };
  });
  if (
    stages.some(
      (stage) =>
        !stage.id ||
        !stage.name ||
        stage.name.length > 120 ||
        !/^#[0-9a-f]{6}$/i.test(stage.color)
    )
  ) {
    return badRequest('Las etapas contienen datos inválidos.');
  }

  try {
    const pipeline = await findAccountPipeline(ctx, id);
    if (!pipeline) return notFound();

    const existing = await ctx.db
      .select({ id: schema.pipelineStages.id })
      .from(schema.pipelineStages)
      .where(eq(schema.pipelineStages.pipelineId, id));
    const existingIds = new Set(existing.map((stage) => stage.id));
    if (
      stages.length !== existing.length ||
      stages.some((stage) => !existingIds.has(stage.id))
    ) {
      return badRequest('La lista de etapas no coincide con el pipeline.');
    }

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(schema.pipelines)
        .set({ name })
        .where(
          and(
            eq(schema.pipelines.id, id),
            eq(schema.pipelines.accountId, ctx.accountId)
          )
        );
      for (const stage of stages) {
        await tx
          .update(schema.pipelineStages)
          .set({
            name: stage.name,
            color: stage.color,
            position: stage.position,
          })
          .where(
            and(
              eq(schema.pipelineStages.id, stage.id),
              eq(schema.pipelineStages.pipelineId, id)
            )
          );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(`${id}/PATCH`, error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const deleted = await ctx.db
      .delete(schema.pipelines)
      .where(
        and(
          eq(schema.pipelines.id, id),
          eq(schema.pipelines.accountId, ctx.accountId)
        )
      )
      .returning({ id: schema.pipelines.id });
    if (!deleted[0]) return notFound();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
