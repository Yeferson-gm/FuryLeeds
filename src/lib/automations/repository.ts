import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { WhatsAppQueryDb } from '@/lib/whatsapp/db';
import type {
  Automation,
  AutomationLog,
  AutomationLogStepResult,
  AutomationTriggerConfig,
  AutomationTriggerType,
} from '@/types';

export type AutomationQueryDb = WhatsAppQueryDb;
export type AutomationRow = typeof schema.automations.$inferSelect;

export function toAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    account_id: row.accountId,
    user_id: row.userId,
    name: row.name,
    description: row.description ?? undefined,
    trigger_type: row.triggerType as AutomationTriggerType,
    trigger_config: row.triggerConfig as AutomationTriggerConfig,
    is_active: row.isActive,
    execution_count: row.executionCount,
    last_executed_at: row.lastExecutedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function listAutomations(
  accountId: string,
  database: AutomationQueryDb = db
): Promise<Automation[]> {
  const rows = await database
    .select()
    .from(schema.automations)
    .where(eq(schema.automations.accountId, accountId))
    .orderBy(desc(schema.automations.createdAt));
  return rows.map(toAutomation);
}

export async function findAutomation(
  accountId: string,
  automationId: string,
  database: AutomationQueryDb = db
): Promise<Automation | null> {
  const [row] = await database
    .select()
    .from(schema.automations)
    .where(
      and(
        eq(schema.automations.id, automationId),
        eq(schema.automations.accountId, accountId)
      )
    )
    .limit(1);
  return row ? toAutomation(row) : null;
}

export async function listAutomationLogs(
  accountId: string,
  automationId: string,
  database: AutomationQueryDb = db
): Promise<AutomationLog[]> {
  const rows = await database
    .select({
      id: schema.automationLogs.id,
      automationId: schema.automationLogs.automationId,
      userId: schema.automationLogs.userId,
      contactId: schema.automationLogs.contactId,
      triggerEvent: schema.automationLogs.triggerEvent,
      stepsExecuted: schema.automationLogs.stepsExecuted,
      status: schema.automationLogs.status,
      errorMessage: schema.automationLogs.errorMessage,
      createdAt: schema.automationLogs.createdAt,
      contactName: schema.contacts.name,
      contactPhone: schema.contacts.phone,
    })
    .from(schema.automationLogs)
    .leftJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.automationLogs.contactId)
    )
    .where(
      and(
        eq(schema.automationLogs.accountId, accountId),
        eq(schema.automationLogs.automationId, automationId)
      )
    )
    .orderBy(desc(schema.automationLogs.createdAt))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    automation_id: row.automationId,
    user_id: row.userId,
    contact_id: row.contactId,
    trigger_event: row.triggerEvent,
    steps_executed: row.stepsExecuted as AutomationLogStepResult[],
    status: row.status as AutomationLog['status'],
    error_message: row.errorMessage,
    created_at: row.createdAt,
    contact: row.contactId
      ? ({
          id: row.contactId,
          name: row.contactName,
          phone: row.contactPhone ?? '',
        } as AutomationLog['contact'])
      : undefined,
  }));
}
