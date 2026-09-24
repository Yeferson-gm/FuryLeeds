import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { WhatsAppQueryDb } from '@/lib/whatsapp/db';

// Builder payload → flat rows for automation_steps. Root steps arrive in
// order. Conditions carry children under branches; UUIDs are assigned before
// insertion so all parent references can be written in one statement.

export interface BuilderStepInput {
  id?: string;
  step_type: string;
  step_config: Record<string, unknown>;
  branches?: { yes?: BuilderStepInput[]; no?: BuilderStepInput[] };
  branch?: 'yes' | 'no' | null;
  parent_index?: number | null;
}

interface InsertRow {
  id: string;
  automationId: string;
  parentStepId: string | null;
  branch: 'yes' | 'no' | null;
  stepType: string;
  stepConfig: Record<string, unknown>;
  position: number;
}

const uid = () => crypto.randomUUID();

async function assertAutomationInAccount(
  database: WhatsAppQueryDb,
  automationId: string,
  accountId: string
): Promise<void> {
  const [owned] = await database
    .select({ id: schema.automations.id })
    .from(schema.automations)
    .where(
      and(
        eq(schema.automations.id, automationId),
        eq(schema.automations.accountId, accountId)
      )
    )
    .limit(1);
  if (!owned) throw new Error('Automation not found for account');
}

export async function replaceSteps(
  automationId: string,
  accountId: string,
  input: BuilderStepInput[],
  database: WhatsAppQueryDb = db
): Promise<void> {
  await assertAutomationInAccount(database, automationId, accountId);
  await database
    .delete(schema.automationSteps)
    .where(eq(schema.automationSteps.automationId, automationId));
  await insertStepRows(database, automationId, input);
}

export async function insertSteps(
  automationId: string,
  accountId: string,
  input: BuilderStepInput[],
  database: WhatsAppQueryDb = db
): Promise<void> {
  await assertAutomationInAccount(database, automationId, accountId);
  await insertStepRows(database, automationId, input);
}

async function insertStepRows(
  database: WhatsAppQueryDb,
  automationId: string,
  input: BuilderStepInput[]
): Promise<void> {
  if (!input?.length) return;

  const looksFlat = input.some(
    (step) => step.branch !== undefined || step.parent_index !== undefined
  );
  const tree = looksFlat ? seedsToTree(input) : input;
  const rows: InsertRow[] = [];

  function walk(
    steps: BuilderStepInput[],
    parentId: string | null,
    branch: 'yes' | 'no' | null
  ) {
    steps.forEach((step, position) => {
      const id = step.id ?? uid();
      rows.push({
        id,
        automationId,
        parentStepId: parentId,
        branch,
        stepType: step.step_type,
        stepConfig: step.step_config ?? {},
        position,
      });
      if (step.step_type === 'condition' && step.branches) {
        if (step.branches.yes) walk(step.branches.yes, id, 'yes');
        if (step.branches.no) walk(step.branches.no, id, 'no');
      }
    });
  }

  walk(tree, null, null);
  if (rows.length) await database.insert(schema.automationSteps).values(rows);
}

function seedsToTree(seeds: BuilderStepInput[]): BuilderStepInput[] {
  const nodes = seeds.map((step) => ({
    ...step,
    branches: { yes: [], no: [] } as {
      yes: BuilderStepInput[];
      no: BuilderStepInput[];
    },
  }));
  const roots: BuilderStepInput[] = [];

  nodes.forEach((node, index) => {
    const seed = seeds[index];
    if (seed.parent_index == null) {
      roots.push(node);
      return;
    }
    const parent = nodes[seed.parent_index];
    if (!parent) return;
    const bucket = seed.branch ?? 'yes';
    parent.branches[bucket].push(node);
  });
  return roots;
}

export interface BuilderStepNode extends BuilderStepInput {
  id: string;
  branches: { yes: BuilderStepNode[]; no: BuilderStepNode[] };
}

export async function loadStepsTree(
  automationId: string,
  accountId: string,
  database: WhatsAppQueryDb = db
): Promise<BuilderStepNode[]> {
  const rows = await database
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
        eq(schema.automations.accountId, accountId)
      )
    )
    .where(eq(schema.automationSteps.automationId, automationId))
    .orderBy(asc(schema.automationSteps.position));

  const byId = new Map<string, BuilderStepNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      step_type: row.stepType,
      step_config: (row.stepConfig ?? {}) as Record<string, unknown>,
      branches: { yes: [], no: [] },
    });
  }

  const roots: BuilderStepNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    if (row.parentStepId) {
      const parent = byId.get(row.parentStepId);
      if (parent)
        parent.branches[(row.branch ?? 'yes') as 'yes' | 'no'].push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
