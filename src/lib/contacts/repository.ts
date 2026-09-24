import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
} from 'drizzle-orm';
import { type db, schema } from '@/lib/db';
import { phonesMatch } from '@/lib/whatsapp/phone-utils';
import type {
  Contact,
  ContactCustomValue,
  ContactNote,
  ContactTag,
  CustomField,
  Deal,
  Tag,
} from '@/types';

export type ContactsDb = typeof db;

type ContactRow = typeof schema.contacts.$inferSelect;
type TagRow = typeof schema.tags.$inferSelect;
type ContactTagRow = typeof schema.contactTags.$inferSelect;
type CustomFieldRow = typeof schema.customFields.$inferSelect;
type ContactCustomValueRow = typeof schema.contactCustomValues.$inferSelect;
type ContactNoteRow = typeof schema.contactNotes.$inferSelect;

export function toContact(row: ContactRow): Contact {
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

export function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    color: row.color,
    created_at: row.createdAt ?? '',
  };
}

export function toContactTag(row: ContactTagRow): ContactTag {
  return { id: row.id, contact_id: row.contactId, tag_id: row.tagId };
}

export function toCustomField(row: CustomFieldRow): CustomField {
  return {
    id: row.id,
    user_id: row.userId,
    account_id: row.accountId,
    field_name: row.fieldName,
    field_type: row.fieldType,
    field_options:
      (row.fieldOptions as Record<string, unknown> | null) ?? undefined,
    created_at: row.createdAt ?? '',
  };
}

export function toCustomValue(row: ContactCustomValueRow): ContactCustomValue {
  return {
    id: row.id,
    contact_id: row.contactId,
    custom_field_id: row.customFieldId,
    value: row.value ?? undefined,
  };
}

export function toContactNote(row: ContactNoteRow): ContactNote {
  return {
    id: row.id,
    contact_id: row.contactId,
    user_id: row.userId,
    note_text: row.noteText,
    created_at: row.createdAt ?? '',
  };
}

export interface ContactWithTags extends Contact {
  tags: Tag[];
}

export async function listTags(
  database: ContactsDb,
  accountId: string
): Promise<Tag[]> {
  const rows = await database
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.accountId, accountId))
    .orderBy(asc(schema.tags.name));
  return rows.map(toTag);
}

export async function listContacts(
  database: ContactsDb,
  input: {
    accountId: string;
    search?: string;
    tagIds?: string[];
    limit: number;
    offset: number;
  }
): Promise<{ contacts: ContactWithTags[]; total: number }> {
  const conditions: SQL[] = [eq(schema.contacts.accountId, input.accountId)];
  const term = input.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    conditions.push(
      or(
        ilike(schema.contacts.name, pattern),
        ilike(schema.contacts.phone, pattern),
        ilike(schema.contacts.email, pattern)
      ) as SQL
    );
  }
  if (input.tagIds?.length) {
    conditions.push(inArray(schema.contactTags.tagId, input.tagIds));
  }
  const where = and(...conditions);

  const base = database
    .selectDistinct({ contact: schema.contacts })
    .from(schema.contacts);
  const rows = input.tagIds?.length
    ? await base
        .innerJoin(
          schema.contactTags,
          eq(schema.contactTags.contactId, schema.contacts.id)
        )
        .where(where)
        .orderBy(desc(schema.contacts.createdAt))
        .limit(input.limit)
        .offset(input.offset)
    : await base
        .where(where)
        .orderBy(desc(schema.contacts.createdAt))
        .limit(input.limit)
        .offset(input.offset);

  const countBase = database
    .select({ total: countDistinct(schema.contacts.id) })
    .from(schema.contacts);
  const [countRow] = input.tagIds?.length
    ? await countBase
        .innerJoin(
          schema.contactTags,
          eq(schema.contactTags.contactId, schema.contacts.id)
        )
        .where(where)
    : await countBase.where(where);

  const contacts = rows.map((row) => toContact(row.contact));
  if (contacts.length === 0) {
    return { contacts: [], total: Number(countRow?.total ?? 0) };
  }

  const joins = await database
    .select({ contactId: schema.contactTags.contactId, tag: schema.tags })
    .from(schema.contactTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
    .where(
      and(
        eq(schema.tags.accountId, input.accountId),
        inArray(
          schema.contactTags.contactId,
          contacts.map((contact) => contact.id)
        )
      )
    );
  const tagsByContact = new Map<string, Tag[]>();
  for (const join of joins) {
    const current = tagsByContact.get(join.contactId) ?? [];
    current.push(toTag(join.tag));
    tagsByContact.set(join.contactId, current);
  }

  return {
    contacts: contacts.map((contact) => ({
      ...contact,
      tags: tagsByContact.get(contact.id) ?? [],
    })),
    total: Number(countRow?.total ?? 0),
  };
}

export async function getOwnedContact(
  database: ContactsDb,
  accountId: string,
  contactId: string
): Promise<ContactRow | null> {
  const [row] = await database
    .select()
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.id, contactId),
        eq(schema.contacts.accountId, accountId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getContactTags(
  database: ContactsDb,
  accountId: string,
  contactId: string
): Promise<ContactTag[]> {
  const rows = await database
    .select({ join: schema.contactTags })
    .from(schema.contactTags)
    .innerJoin(
      schema.contacts,
      and(
        eq(schema.contacts.id, schema.contactTags.contactId),
        eq(schema.contacts.accountId, accountId)
      )
    )
    .where(eq(schema.contactTags.contactId, contactId));
  return rows.map((row) => toContactTag(row.join));
}

export async function getContactDetail(
  database: ContactsDb,
  accountId: string,
  contactId: string
) {
  const contactRow = await getOwnedContact(database, accountId, contactId);
  if (!contactRow) return null;

  const [tags, contactTags, noteRows, fieldRows, valueRows, dealRows] =
    await Promise.all([
      listTags(database, accountId),
      getContactTags(database, accountId, contactId),
      database
        .select()
        .from(schema.contactNotes)
        .where(
          and(
            eq(schema.contactNotes.accountId, accountId),
            eq(schema.contactNotes.contactId, contactId)
          )
        )
        .orderBy(desc(schema.contactNotes.createdAt)),
      database
        .select()
        .from(schema.customFields)
        .where(eq(schema.customFields.accountId, accountId))
        .orderBy(asc(schema.customFields.fieldName)),
      database
        .select({ value: schema.contactCustomValues })
        .from(schema.contactCustomValues)
        .innerJoin(
          schema.customFields,
          and(
            eq(
              schema.customFields.id,
              schema.contactCustomValues.customFieldId
            ),
            eq(schema.customFields.accountId, accountId)
          )
        )
        .where(eq(schema.contactCustomValues.contactId, contactId)),
      database
        .select({ deal: schema.deals, stage: schema.pipelineStages })
        .from(schema.deals)
        .innerJoin(
          schema.pipelineStages,
          eq(schema.pipelineStages.id, schema.deals.stageId)
        )
        .where(
          and(
            eq(schema.deals.accountId, accountId),
            eq(schema.deals.contactId, contactId)
          )
        )
        .orderBy(desc(schema.deals.createdAt)),
    ]);

  const deals: Deal[] = dealRows.map(({ deal, stage }) => ({
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
    status: (deal.status as Deal['status']) ?? undefined,
    created_at: deal.createdAt ?? '',
    updated_at: deal.updatedAt ?? undefined,
    stage: {
      id: stage.id,
      pipeline_id: stage.pipelineId,
      name: stage.name,
      position: stage.position,
      color: stage.color,
      created_at: stage.createdAt ?? '',
    },
  }));

  return {
    contact: toContact(contactRow),
    tags,
    contactTags,
    notes: noteRows.map(toContactNote),
    customFields: fieldRows.map(toCustomField),
    customValues: valueRows.map((row) => toCustomValue(row.value)),
    deals,
  };
}

export async function findContactByPhone(
  database: ContactsDb,
  accountId: string,
  phone: string
): Promise<Contact | null> {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const suffix = digits.length >= 8 ? digits.slice(-8) : digits;
  const rows = await database
    .select()
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.accountId, accountId),
        ilike(schema.contacts.phone, `%${suffix}`)
      )
    );
  const match = rows.find((row) => phonesMatch(row.phone, phone));
  return match ? toContact(match) : null;
}
