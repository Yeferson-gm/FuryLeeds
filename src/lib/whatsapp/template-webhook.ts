import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db';
import { isUniqueViolation, type WhatsAppQueryDb } from '@/lib/whatsapp/db';
import { normalizeStatus } from './template-status-normalize';

const TEMPLATE_WEBHOOK_FIELDS = new Set([
  'message_template_status_update',
  'message_template_quality_update',
  'message_template_components_update',
]);

export function isTemplateWebhookField(field: string): boolean {
  return TEMPLATE_WEBHOOK_FIELDS.has(field);
}

interface TemplateStatusUpdateValue {
  event?: string;
  message_template_id?: string | number;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
}

interface TemplateQualityUpdateValue {
  message_template_id?: string | number;
  message_template_name?: string;
  message_template_language?: string;
  previous_quality_score?: string;
  new_quality_score?: string;
}

interface TemplateComponentsUpdateValue {
  message_template_id?: string | number;
  message_template_name?: string;
  message_template_language?: string;
}

export interface TemplateWebhookChange {
  field: string;
  value: unknown;
  wabaId?: string;
}

const STUB_BODY_TEXT = '';
const DEFAULT_TEMPLATE_LANGUAGE = 'en_US';
type TemplateWrite = Partial<typeof schema.messageTemplates.$inferInsert>;

export async function handleTemplateWebhookChange(
  change: TemplateWebhookChange,
  database: WhatsAppQueryDb
): Promise<void> {
  switch (change.field) {
    case 'message_template_status_update':
      await handleStatusUpdate(
        change.value as TemplateStatusUpdateValue,
        database,
        change.wabaId
      );
      return;
    case 'message_template_quality_update':
      await handleQualityUpdate(
        change.value as TemplateQualityUpdateValue,
        database,
        change.wabaId
      );
      return;
    case 'message_template_components_update':
      handleComponentsUpdate(change.value as TemplateComponentsUpdateValue);
  }
}

async function updateTemplate(
  database: WhatsAppQueryDb,
  metaTemplateId: string,
  fields: TemplateWrite
): Promise<{ id: string }[]> {
  return database
    .update(schema.messageTemplates)
    .set(fields)
    .where(eq(schema.messageTemplates.metaTemplateId, metaTemplateId))
    .returning({ id: schema.messageTemplates.id });
}

async function handleStatusUpdate(
  value: TemplateStatusUpdateValue,
  database: WhatsAppQueryDb,
  wabaId: string | undefined
): Promise<void> {
  const metaTemplateId =
    value.message_template_id !== undefined
      ? String(value.message_template_id)
      : null;
  if (!metaTemplateId || !value.event) {
    console.warn(
      '[template-webhook] status update missing message_template_id or event:',
      value
    );
    return;
  }

  const status = normalizeStatus(value.event);
  const fields: TemplateWrite = {
    status,
    rejectionReason:
      status === 'REJECTED' ? (value.reason ?? 'Rejected by Meta') : null,
    submissionError: null,
  };

  try {
    const rows = await updateTemplate(database, metaTemplateId, fields);
    if (rows.length === 0) {
      await createStubForUnknownTemplate({
        kind: 'status update',
        metaTemplateId,
        name: value.message_template_name,
        language: value.message_template_language,
        wabaId,
        fields,
        retryUpdate: () => updateTemplate(database, metaTemplateId, fields),
        database,
      });
    } else if (rows.length > 1) {
      console.warn(
        `[template-webhook] status update matched ${rows.length} rows for meta_template_id ${metaTemplateId} — investigate.`
      );
    }
  } catch (error) {
    console.error(
      '[template-webhook] status update failed for meta_template_id',
      metaTemplateId,
      error
    );
  }
}

async function handleQualityUpdate(
  value: TemplateQualityUpdateValue,
  database: WhatsAppQueryDb,
  wabaId: string | undefined
): Promise<void> {
  const metaTemplateId =
    value.message_template_id !== undefined
      ? String(value.message_template_id)
      : null;
  if (!metaTemplateId) {
    console.warn(
      '[template-webhook] quality update missing message_template_id:',
      value
    );
    return;
  }

  const raw = value.new_quality_score;
  const qualityScore =
    raw && ['GREEN', 'YELLOW', 'RED'].includes(raw.toUpperCase())
      ? raw.toUpperCase()
      : null;
  const fields: TemplateWrite = { qualityScore };

  try {
    const rows = await updateTemplate(database, metaTemplateId, fields);
    if (rows.length === 0) {
      await createStubForUnknownTemplate({
        kind: 'quality update',
        metaTemplateId,
        name: value.message_template_name,
        language: value.message_template_language,
        wabaId,
        fields,
        retryUpdate: () => updateTemplate(database, metaTemplateId, fields),
        database,
      });
    }
  } catch (error) {
    console.error(
      '[template-webhook] quality update failed for meta_template_id',
      metaTemplateId,
      error
    );
  }
}

interface StubParams {
  kind: string;
  metaTemplateId: string;
  name: string | undefined;
  language: string | undefined;
  wabaId: string | undefined;
  fields: TemplateWrite;
  retryUpdate: () => Promise<{ id: string }[]>;
  database: WhatsAppQueryDb;
}

async function createStubForUnknownTemplate(p: StubParams): Promise<void> {
  const { kind, metaTemplateId, name, wabaId, database } = p;
  const location = `meta_template_id ${metaTemplateId} (${name ?? 'unnamed'}), WABA ${wabaId ?? 'unknown'}`;

  if (!wabaId) {
    console.warn(
      `[template-webhook] ${kind} for unknown template ${location} — no WABA id on the webhook entry, cannot resolve the account; run "Sync from Meta".`
    );
    return;
  }
  if (!name) {
    console.warn(
      `[template-webhook] ${kind} for unknown template ${location} — event has no message_template_name, cannot create a stub row; run "Sync from Meta".`
    );
    return;
  }

  let configs: { accountId: string; userId: string }[];
  try {
    configs = await database
      .select({
        accountId: schema.whatsappConfig.accountId,
        userId: schema.whatsappConfig.userId,
      })
      .from(schema.whatsappConfig)
      .where(eq(schema.whatsappConfig.wabaId, wabaId));
  } catch (error) {
    console.error(
      `[template-webhook] ${kind} for unknown template ${location} — whatsapp_config lookup failed:`,
      error
    );
    return;
  }

  if (configs.length !== 1) {
    console.warn(
      `[template-webhook] ${kind} for unknown template ${location} — ${configs.length === 0 ? 'no' : configs.length} whatsapp_config rows match that WABA id; not creating a stub. Run "Sync from Meta" for the owning account.`
    );
    return;
  }

  const config = configs[0];
  try {
    await database.insert(schema.messageTemplates).values({
      accountId: config.accountId,
      userId: config.userId,
      metaTemplateId,
      name,
      language: p.language || DEFAULT_TEMPLATE_LANGUAGE,
      bodyText: STUB_BODY_TEXT,
      ...p.fields,
    });
    console.info(
      `[template-webhook] ${kind} for unknown template ${location} — created stub row for account ${config.accountId}; run "Sync from Meta" to backfill components.`
    );
  } catch (error) {
    if (!isUniqueViolation(error)) {
      console.error(
        `[template-webhook] ${kind} for unknown template ${location} — stub insert failed:`,
        error
      );
      return;
    }

    try {
      const rows = await p.retryUpdate();
      if (rows.length === 0) {
        console.warn(
          `[template-webhook] ${kind} for unknown template ${location} — a local row with the same name/language exists but is not linked to this meta_template_id; run "Sync from Meta" to link it.`
        );
      }
    } catch (retryError) {
      console.error(
        `[template-webhook] ${kind} for unknown template ${location} — retry after unique violation failed:`,
        retryError
      );
    }
  }
}

function handleComponentsUpdate(value: TemplateComponentsUpdateValue): void {
  console.info(
    '[template-webhook] components updated by Meta for template',
    value.message_template_id,
    value.message_template_name,
    value.message_template_language,
    '— run "Sync from Meta" to pull the new components.'
  );
}
