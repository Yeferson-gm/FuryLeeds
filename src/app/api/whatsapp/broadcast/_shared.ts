import { and, eq, ilike, inArray, ne } from 'drizzle-orm';
import { schema } from '@/lib/db';
import { findOrCreateContact, type WhatsAppDb } from '@/lib/whatsapp/db';
import type { Contact } from '@/types';

export type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv';
export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: {
    fieldId: string;
    operator: CustomFieldOperator;
    value: string;
  };
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
}

export type VariableMapping = {
  type: 'static' | 'field' | 'custom_field';
  value: string;
};

type ContactRow = typeof schema.contacts.$inferSelect;

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    user_id: row.userId,
    account_id: row.accountId,
    phone: row.phone,
    phone_normalized: row.phoneNormalized ?? undefined,
    wa_user_id: row.waUserId,
    wa_parent_user_id: row.waParentUserId,
    wa_username: row.waUsername,
    name: row.name ?? undefined,
    email: row.email ?? undefined,
    company: row.company ?? undefined,
    avatar_url: row.avatarUrl ?? undefined,
    created_at: row.createdAt ?? '',
    updated_at: row.updatedAt ?? '',
  };
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string =>
              typeof item === 'string' && item.length > 0
          )
        ),
      ]
    : [];
}

export function parseAudience(value: unknown): AudienceConfig | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!['all', 'tags', 'custom_field', 'csv'].includes(String(raw.type)))
    return null;

  const custom = raw.customField;
  const customField =
    custom && typeof custom === 'object'
      ? {
          fieldId:
            typeof (custom as Record<string, unknown>).fieldId === 'string'
              ? String((custom as Record<string, unknown>).fieldId)
              : '',
          operator: (['is', 'is_not', 'contains'].includes(
            String((custom as Record<string, unknown>).operator)
          )
            ? (custom as Record<string, unknown>).operator
            : 'is') as CustomFieldOperator,
          value:
            typeof (custom as Record<string, unknown>).value === 'string'
              ? String((custom as Record<string, unknown>).value)
              : '',
        }
      : undefined;

  const csvContacts = Array.isArray(raw.csvContacts)
    ? raw.csvContacts.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const row = item as Record<string, unknown>;
        if (typeof row.phone !== 'string' || !row.phone.trim()) return [];
        return [
          {
            phone: row.phone.trim(),
            name: typeof row.name === 'string' ? row.name.trim() : undefined,
          },
        ];
      })
    : undefined;

  return {
    type: raw.type as AudienceType,
    tagIds: uniqueStrings(raw.tagIds),
    customField,
    csvContacts,
    excludeTagIds: uniqueStrings(raw.excludeTagIds),
  };
}

export function parseVariables(
  value: unknown
): Record<string, VariableMapping> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, VariableMapping> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const mapping = raw as Record<string, unknown>;
    if (
      ['static', 'field', 'custom_field'].includes(String(mapping.type)) &&
      typeof mapping.value === 'string'
    ) {
      result[key] = {
        type: mapping.type as VariableMapping['type'],
        value: mapping.value,
      };
    }
  }
  return result;
}

async function loadExcludedIds(
  db: WhatsAppDb,
  accountId: string,
  tagIds: string[]
): Promise<Set<string>> {
  if (tagIds.length === 0) return new Set();
  const rows = await db
    .select({ contactId: schema.contactTags.contactId })
    .from(schema.contactTags)
    .innerJoin(
      schema.contacts,
      and(
        eq(schema.contacts.id, schema.contactTags.contactId),
        eq(schema.contacts.accountId, accountId)
      )
    )
    .where(inArray(schema.contactTags.tagId, tagIds));
  return new Set(rows.map((row) => row.contactId));
}

export async function resolveAudience(
  db: WhatsAppDb,
  accountId: string,
  userId: string,
  audience: AudienceConfig,
  options: { createCsvContacts: boolean }
): Promise<Contact[]> {
  let rows: ContactRow[] = [];

  if (audience.type === 'all') {
    rows = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.accountId, accountId));
  } else if (audience.type === 'tags') {
    const tagIds = audience.tagIds ?? [];
    if (tagIds.length === 0) return [];
    rows = await db
      .select({ contact: schema.contacts })
      .from(schema.contactTags)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.id, schema.contactTags.contactId),
          eq(schema.contacts.accountId, accountId)
        )
      )
      .where(inArray(schema.contactTags.tagId, tagIds))
      .then((matches) => matches.map((match) => match.contact));
  } else if (audience.type === 'custom_field') {
    const filter = audience.customField;
    if (!filter?.fieldId || !filter.value) return [];
    const [ownedField] = await db
      .select({ id: schema.customFields.id })
      .from(schema.customFields)
      .where(
        and(
          eq(schema.customFields.id, filter.fieldId),
          eq(schema.customFields.accountId, accountId)
        )
      )
      .limit(1);
    if (!ownedField) return [];

    const valueCondition =
      filter.operator === 'is'
        ? eq(schema.contactCustomValues.value, filter.value)
        : filter.operator === 'is_not'
          ? ne(schema.contactCustomValues.value, filter.value)
          : ilike(schema.contactCustomValues.value, `%${filter.value}%`);

    const matches = await db
      .select({ contact: schema.contacts })
      .from(schema.contactCustomValues)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.id, schema.contactCustomValues.contactId),
          eq(schema.contacts.accountId, accountId)
        )
      )
      .where(
        and(
          eq(schema.contactCustomValues.customFieldId, filter.fieldId),
          valueCondition
        )
      );
    rows = matches.map((match) => match.contact);
  } else if (audience.type === 'csv') {
    if (!options.createCsvContacts) {
      return (audience.csvContacts ?? []).map((row, index) => ({
        id: `csv-${index}`,
        user_id: userId,
        account_id: accountId,
        phone: row.phone,
        name: row.name,
        created_at: '',
        updated_at: '',
      }));
    }
    const ids: string[] = [];
    for (const row of audience.csvContacts ?? []) {
      const contact = await findOrCreateContact(
        db,
        accountId,
        userId,
        row.phone,
        row.name
      );
      ids.push(contact.id);
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 0) {
      rows = await db
        .select()
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.accountId, accountId),
            inArray(schema.contacts.id, uniqueIds)
          )
        );
    }
  }

  const excluded = await loadExcludedIds(
    db,
    accountId,
    audience.excludeTagIds ?? []
  );
  const deduped = new Map<string, Contact>();
  for (const row of rows) {
    if (!excluded.has(row.id)) deduped.set(row.id, toContact(row));
  }
  return [...deduped.values()];
}

export async function customValuesByContact(
  db: WhatsAppDb,
  accountId: string,
  contactIds: string[]
): Promise<Map<string, Map<string, string>>> {
  const result = new Map<string, Map<string, string>>();
  if (contactIds.length === 0) return result;
  const rows = await db
    .select({
      contactId: schema.contactCustomValues.contactId,
      fieldId: schema.contactCustomValues.customFieldId,
      value: schema.contactCustomValues.value,
    })
    .from(schema.contactCustomValues)
    .innerJoin(
      schema.contacts,
      and(
        eq(schema.contacts.id, schema.contactCustomValues.contactId),
        eq(schema.contacts.accountId, accountId),
        inArray(schema.contacts.id, contactIds)
      )
    );
  for (const row of rows) {
    const bucket = result.get(row.contactId) ?? new Map<string, string>();
    bucket.set(row.fieldId, row.value ?? '');
    result.set(row.contactId, bucket);
  }
  return result;
}

export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues?: Map<string, string>
): string[] {
  return Object.keys(variables)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((key) => {
      const mapping = variables[key];
      if (mapping.type === 'static') return mapping.value;
      if (mapping.type === 'custom_field')
        return customValues?.get(mapping.value) ?? '';
      const fields: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      return fields[mapping.value] ?? '';
    });
}
