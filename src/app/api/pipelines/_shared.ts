import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import type { AccountContext } from '@/lib/auth/account';
import { schema } from '@/lib/db';

export const DEFAULT_STAGES = [
  { name: 'Nuevo prospecto', color: '#3b82f6', position: 0 },
  { name: 'Calificado', color: '#eab308', position: 1 },
  { name: 'Propuesta enviada', color: '#f97316', position: 2 },
  { name: 'Negociación', color: '#8b5cf6', position: 3 },
  { name: 'Ganado', color: '#22c55e', position: 4 },
] as const;

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export function notFound() {
  return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
}

export function serverError(scope: string, error: unknown) {
  console.error(`[api/pipelines/${scope}]`, error);
  return NextResponse.json(
    { error: 'No se pudo procesar la solicitud.' },
    { status: 500 }
  );
}

export async function findAccountPipeline(
  ctx: AccountContext,
  pipelineId: string
) {
  const [pipeline] = await ctx.db
    .select()
    .from(schema.pipelines)
    .where(
      and(
        eq(schema.pipelines.id, pipelineId),
        eq(schema.pipelines.accountId, ctx.accountId)
      )
    )
    .limit(1);
  return pipeline;
}

export function toPipeline(row: typeof schema.pipelines.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    created_at: row.createdAt ?? '',
  };
}

export function toStage(row: typeof schema.pipelineStages.$inferSelect) {
  return {
    id: row.id,
    pipeline_id: row.pipelineId,
    name: row.name,
    position: row.position,
    color: row.color,
    created_at: row.createdAt ?? '',
  };
}

export function isDealStatus(
  value: unknown
): value is (typeof DEAL_STATUSES)[number] {
  return DEAL_STATUSES.includes(value as (typeof DEAL_STATUSES)[number]);
}

export function readDealPayload(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const stageId = typeof input.stage_id === 'string' ? input.stage_id : '';
  const contactId =
    typeof input.contact_id === 'string' ? input.contact_id : '';
  const currency =
    typeof input.currency === 'string' ? input.currency.trim() : '';
  const rawValue =
    typeof input.value === 'number' || typeof input.value === 'string'
      ? Number(input.value)
      : Number.NaN;

  if (
    !title ||
    !stageId ||
    !contactId ||
    !currency ||
    currency.length !== 3 ||
    !Number.isFinite(rawValue) ||
    rawValue < 0
  ) {
    return null;
  }

  return {
    title,
    stageId,
    contactId,
    currency: currency.toUpperCase(),
    value: rawValue.toFixed(2),
    assignedTo:
      typeof input.assigned_to === 'string' && input.assigned_to
        ? input.assigned_to
        : null,
    notes:
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null,
    expectedCloseDate:
      typeof input.expected_close_date === 'string' && input.expected_close_date
        ? input.expected_close_date
        : null,
  };
}

export async function validateDealReferences(
  ctx: AccountContext,
  pipelineId: string,
  payload: NonNullable<ReturnType<typeof readDealPayload>>
) {
  const [stage, contact, assignee] = await Promise.all([
    ctx.db
      .select({ id: schema.pipelineStages.id })
      .from(schema.pipelineStages)
      .where(
        and(
          eq(schema.pipelineStages.id, payload.stageId),
          eq(schema.pipelineStages.pipelineId, pipelineId)
        )
      )
      .limit(1),
    ctx.db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.id, payload.contactId),
          eq(schema.contacts.accountId, ctx.accountId)
        )
      )
      .limit(1),
    payload.assignedTo
      ? ctx.db
          .select({ id: schema.profiles.id })
          .from(schema.profiles)
          .where(
            and(
              eq(schema.profiles.id, payload.assignedTo),
              eq(schema.profiles.accountId, ctx.accountId)
            )
          )
          .limit(1)
      : Promise.resolve([{ id: null }]),
  ]);

  return Boolean(stage[0] && contact[0] && assignee[0]);
}
