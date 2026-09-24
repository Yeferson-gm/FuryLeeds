import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { findAutomation } from '@/lib/automations/repository';
import {
  type BuilderStepInput,
  loadStepsTree,
  replaceSteps,
} from '@/lib/automations/steps-tree';
import {
  validateStepsForActivation,
  validateTriggerForActivation,
} from '@/lib/automations/validate';
import { db, schema } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('viewer');
    const { id } = await params;
    const automation = await findAutomation(ctx.accountId, id);
    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const steps = await loadStepsTree(id, ctx.accountId);
    return NextResponse.json({ automation, steps });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('agent');
  } catch (error) {
    return toErrorResponse(error);
  }

  const [{ id }, body] = await Promise.all([
    params,
    request.json().catch(() => null),
  ]);
  if (!body)
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const existing = await findAutomation(ctx.accountId, id);
  if (!existing)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const update: Partial<typeof schema.automations.$inferInsert> = {};
  if ('name' in body) update.name = body.name;
  if ('description' in body) update.description = body.description;
  if ('trigger_type' in body) update.triggerType = body.trigger_type;
  if ('trigger_config' in body) update.triggerConfig = body.trigger_config;
  if ('is_active' in body) update.isActive = body.is_active;

  const willBeActive =
    typeof update.isActive === 'boolean' ? update.isActive : existing.is_active;
  if (willBeActive) {
    const mergedSteps = Array.isArray(body.steps)
      ? (body.steps as {
          step_type: string;
          step_config: Record<string, unknown>;
        }[])
      : await loadStepsTree(id, ctx.accountId);
    const issues = [
      ...validateTriggerForActivation(
        (update.triggerType ?? existing.trigger_type) as string,
        update.triggerConfig ?? existing.trigger_config
      ),
      ...validateStepsForActivation(mergedSteps),
    ];
    if (issues.length) {
      return NextResponse.json(
        {
          error: 'Cannot keep automation active with invalid configuration',
          issues,
        },
        { status: 400 }
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (Object.keys(update).length) {
        await tx
          .update(schema.automations)
          .set({ ...update, updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(schema.automations.id, id),
              eq(schema.automations.accountId, ctx.accountId)
            )
          );
      }
      if (Array.isArray(body.steps)) {
        await replaceSteps(
          id,
          ctx.accountId,
          body.steps as BuilderStepInput[],
          tx
        );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'update failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await params;
    await db
      .delete(schema.automations)
      .where(
        and(
          eq(schema.automations.id, id),
          eq(schema.automations.accountId, ctx.accountId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
