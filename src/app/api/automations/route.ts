import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { listAutomations, toAutomation } from '@/lib/automations/repository';
import {
  type BuilderStepInput,
  insertSteps,
} from '@/lib/automations/steps-tree';
import { getTemplate } from '@/lib/automations/templates';
import {
  validateStepsForActivation,
  validateTriggerForActivation,
} from '@/lib/automations/validate';
import { db, schema } from '@/lib/db';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    return NextResponse.json({
      automations: await listAutomations(ctx.accountId),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('agent');
  } catch (error) {
    return toErrorResponse(error);
  }

  const body = await request.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const {
    name,
    description,
    trigger_type,
    trigger_config,
    is_active,
    steps,
    template,
  } = body;

  let effectiveSteps: BuilderStepInput[] | undefined = steps;
  let effectiveName = name;
  let effectiveDescription = description;
  let effectiveTriggerType = trigger_type;
  let effectiveTriggerConfig = trigger_config;

  if (template && (!steps || steps.length === 0)) {
    const selected = getTemplate(template);
    if (selected) {
      effectiveName = effectiveName ?? selected.name;
      effectiveDescription = effectiveDescription ?? selected.description;
      effectiveTriggerType = effectiveTriggerType ?? selected.trigger_type;
      effectiveTriggerConfig =
        effectiveTriggerConfig ?? selected.trigger_config;
      effectiveSteps = selected.steps as unknown as BuilderStepInput[];
    }
  }

  if (!effectiveName || !effectiveTriggerType) {
    return NextResponse.json(
      { error: 'name and trigger_type are required' },
      { status: 400 }
    );
  }

  if (is_active) {
    const issues = [
      ...validateTriggerForActivation(
        effectiveTriggerType,
        effectiveTriggerConfig ?? {}
      ),
      ...validateStepsForActivation(
        (effectiveSteps ?? []) as unknown as {
          step_type: string;
          step_config: Record<string, unknown>;
        }[]
      ),
    ];
    if (issues.length) {
      return NextResponse.json(
        {
          error: 'Cannot activate automation with invalid configuration',
          issues,
        },
        { status: 400 }
      );
    }
  }

  try {
    const automation = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.automations)
        .values({
          accountId: ctx.accountId,
          userId: ctx.userId,
          name: effectiveName,
          description: effectiveDescription ?? null,
          triggerType: effectiveTriggerType,
          triggerConfig: effectiveTriggerConfig ?? {},
          isActive: Boolean(is_active),
        })
        .returning();
      if (!created) throw new Error('insert failed');
      if (effectiveSteps?.length) {
        await insertSteps(created.id, ctx.accountId, effectiveSteps, tx);
      }
      return toAutomation(created);
    });
    return NextResponse.json({ automation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'insert failed' },
      { status: 500 }
    );
  }
}
