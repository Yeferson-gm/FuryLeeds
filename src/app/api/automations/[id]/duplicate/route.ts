import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { toAutomation } from '@/lib/automations/repository';
import { db, schema } from '@/lib/db';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('agent');
  } catch (error) {
    return toErrorResponse(error);
  }

  const { id } = await params;
  try {
    const automation = await db.transaction(async (tx) => {
      const [original] = await tx
        .select()
        .from(schema.automations)
        .where(
          and(
            eq(schema.automations.id, id),
            eq(schema.automations.accountId, ctx.accountId)
          )
        )
        .limit(1);
      if (!original) return null;

      const [copy] = await tx
        .insert(schema.automations)
        .values({
          accountId: ctx.accountId,
          userId: ctx.userId,
          name: `${original.name} (Copy)`,
          description: original.description,
          triggerType: original.triggerType,
          triggerConfig: original.triggerConfig,
          isActive: false,
        })
        .returning();
      if (!copy) throw new Error('copy failed');

      const steps = await tx
        .select({
          id: schema.automationSteps.id,
          parentStepId: schema.automationSteps.parentStepId,
          branch: schema.automationSteps.branch,
          stepType: schema.automationSteps.stepType,
          stepConfig: schema.automationSteps.stepConfig,
          position: schema.automationSteps.position,
        })
        .from(schema.automationSteps)
        .innerJoin(
          schema.automations,
          and(
            eq(schema.automations.id, schema.automationSteps.automationId),
            eq(schema.automations.accountId, ctx.accountId)
          )
        )
        .where(eq(schema.automationSteps.automationId, id))
        .orderBy(asc(schema.automationSteps.position));

      if (steps.length) {
        const idMap = new Map(
          steps.map((step) => [step.id, crypto.randomUUID()])
        );
        await tx.insert(schema.automationSteps).values(
          steps.map((step) => ({
            id: idMap.get(step.id) as string,
            automationId: copy.id,
            parentStepId: step.parentStepId
              ? (idMap.get(step.parentStepId) ?? null)
              : null,
            branch: step.branch,
            stepType: step.stepType,
            stepConfig: step.stepConfig,
            position: step.position,
          }))
        );
      }
      return toAutomation(copy);
    });

    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ automation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'copy failed' },
      { status: 500 }
    );
  }
}
