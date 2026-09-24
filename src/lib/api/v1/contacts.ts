import {
  and,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { type db as appDb, schema } from '@/lib/db';
import {
  findExistingContact,
  isUniqueViolation,
  type WhatsAppQueryDb,
} from '@/lib/whatsapp/db';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';
import type { Cursor } from './pagination';

export interface ApiContact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  tags: { id: string; name: string; color: string }[];
  created_at: string;
  updated_at: string;
}

export class ContactError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ContactError';
    this.status = status;
  }
}

type ApiDatabase = WhatsAppQueryDb & Partial<Pick<typeof appDb, 'transaction'>>;
type RawTagJoin = { tags: { id: string; name: string; color: string } | null };

export function serializeContact(row: Record<string, unknown>): ApiContact {
  const joins = (row.contact_tags as RawTagJoin[] | undefined) ?? [];
  return {
    id: row.id as string,
    phone: row.phone as string,
    name: (row.name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    tags: joins
      .map((join) => join.tags)
      .filter((tag): tag is NonNullable<RawTagJoin['tags']> => tag != null)
      .map(({ id, name, color }) => ({ id, name, color })),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function resolveAuditUserId(
  database: WhatsAppQueryDb,
  accountId: string
): Promise<string> {
  const [config] = await database
    .select({ userId: schema.whatsappConfig.userId })
    .from(schema.whatsappConfig)
    .where(eq(schema.whatsappConfig.accountId, accountId))
    .limit(1);
  if (config?.userId) return config.userId;

  const [account] = await database
    .select({ ownerUserId: schema.accounts.ownerUserId })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .limit(1);
  if (!account?.ownerUserId) {
    throw new ContactError('Account owner could not be resolved', 500);
  }
  return account.ownerUserId;
}

export interface ContactInput {
  phone: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
}

export async function findOrCreateContact(
  database: WhatsAppQueryDb,
  accountId: string,
  auditUserId: string,
  input: ContactInput
): Promise<{ id: string; created: boolean }> {
  const sanitized = parseInternationalPhone(input.phone);
  if (!sanitized) {
    throw new ContactError(
      "'phone' must be an international phone number with a leading + and country code (e.g. +14155550123)",
      400
    );
  }

  const existing = await findExistingContact(database, accountId, sanitized);
  if (existing) return { id: existing.id, created: false };

  try {
    const [created] = await database
      .insert(schema.contacts)
      .values({
        accountId,
        userId: auditUserId,
        phone: sanitized,
        name: input.name ?? sanitized,
        email: input.email ?? null,
        company: input.company ?? null,
      })
      .returning({ id: schema.contacts.id });
    if (!created) throw new Error('Contact insert returned no row');
    return { id: created.id, created: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await findExistingContact(database, accountId, sanitized);
      if (raced) return { id: raced.id, created: false };
    }
    console.error('[api/v1/contacts] create error:', error);
    throw new ContactError('Failed to create contact', 500);
  }
}

function contactFields() {
  return {
    id: schema.contacts.id,
    phone: schema.contacts.phone,
    name: schema.contacts.name,
    email: schema.contacts.email,
    company: schema.contacts.company,
    avatar_url: schema.contacts.avatarUrl,
    created_at: schema.contacts.createdAt,
    updated_at: schema.contacts.updatedAt,
  };
}

async function hydrateContactTags(
  database: WhatsAppQueryDb,
  accountId: string,
  rows: Array<Record<string, unknown> & { id: string }>
): Promise<ApiContact[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const tagRows = await database
    .select({
      contactId: schema.contactTags.contactId,
      id: schema.tags.id,
      name: schema.tags.name,
      color: schema.tags.color,
    })
    .from(schema.contactTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.contactTags.contactId)
    )
    .where(
      and(
        inArray(schema.contactTags.contactId, ids),
        eq(schema.contacts.accountId, accountId),
        eq(schema.tags.accountId, accountId)
      )
    );

  const tagsByContact = new Map<string, RawTagJoin[]>();
  for (const tag of tagRows) {
    const joins = tagsByContact.get(tag.contactId) ?? [];
    joins.push({ tags: { id: tag.id, name: tag.name, color: tag.color } });
    tagsByContact.set(tag.contactId, joins);
  }
  return rows.map((row) =>
    serializeContact({ ...row, contact_tags: tagsByContact.get(row.id) ?? [] })
  );
}

export async function listContacts(
  database: WhatsAppQueryDb,
  accountId: string,
  options: {
    limit: number;
    cursor: Cursor | null;
    search: string;
    tagId: string | null;
  }
): Promise<ApiContact[]> {
  const filters = [eq(schema.contacts.accountId, accountId)];
  if (options.search) {
    filters.push(
      or(
        ilike(schema.contacts.name, `%${options.search}%`),
        ilike(schema.contacts.phone, `%${options.search}%`)
      ) as ReturnType<typeof eq>
    );
  }
  if (options.tagId) {
    filters.push(
      exists(
        database
          .select({ id: schema.contactTags.id })
          .from(schema.contactTags)
          .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
          .where(
            and(
              eq(schema.contactTags.contactId, schema.contacts.id),
              eq(schema.contactTags.tagId, options.tagId),
              eq(schema.tags.accountId, accountId)
            )
          )
      )
    );
  }
  if (options.cursor) {
    filters.push(
      or(
        lt(schema.contacts.createdAt, options.cursor.createdAt),
        and(
          eq(schema.contacts.createdAt, options.cursor.createdAt),
          lt(schema.contacts.id, options.cursor.id)
        )
      ) as ReturnType<typeof eq>
    );
  }

  const rows = await database
    .select(contactFields())
    .from(schema.contacts)
    .where(and(...filters))
    .orderBy(desc(schema.contacts.createdAt), desc(schema.contacts.id))
    .limit(options.limit + 1);
  return hydrateContactTags(
    database,
    accountId,
    rows as Array<Record<string, unknown> & { id: string }>
  );
}

async function syncContactTags(
  database: WhatsAppQueryDb,
  accountId: string,
  auditUserId: string,
  contactId: string,
  tagNames: string[]
): Promise<string[]> {
  const [ownedContact] = await database
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.id, contactId),
        eq(schema.contacts.accountId, accountId)
      )
    )
    .limit(1);
  if (!ownedContact) throw new ContactError('Contact not found', 404);

  const requested = new Map<string, string>();
  for (const raw of tagNames) {
    const name = raw.trim();
    if (name) requested.set(name.toLowerCase(), name);
  }

  const accountTags = await database
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(eq(schema.tags.accountId, accountId));
  const byName = new Map(
    accountTags.map((tag) => [tag.name.trim().toLowerCase(), tag.id])
  );
  const missing = [...requested].filter(([key]) => !byName.has(key));
  if (missing.length > 0) {
    const created = await database
      .insert(schema.tags)
      .values(
        missing.map(([, name]) => ({
          accountId,
          userId: auditUserId,
          name,
          color: '#3b82f6',
        }))
      )
      .returning({ id: schema.tags.id, name: schema.tags.name });
    for (const tag of created)
      byName.set(tag.name.trim().toLowerCase(), tag.id);
  }

  const desired = new Set(
    [...requested.keys()]
      .map((key) => byName.get(key))
      .filter((id): id is string => Boolean(id))
  );
  const current = await database
    .select({ tagId: schema.contactTags.tagId })
    .from(schema.contactTags)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.contactTags.contactId)
    )
    .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
    .where(
      and(
        eq(schema.contactTags.contactId, contactId),
        eq(schema.contacts.accountId, accountId),
        eq(schema.tags.accountId, accountId)
      )
    );
  const existing = new Set(current.map((row) => row.tagId));
  const toRemove = [...existing].filter((id) => !desired.has(id));
  const toAdd = [...desired].filter((id) => !existing.has(id));

  if (toRemove.length > 0) {
    await database.delete(schema.contactTags).where(
      and(
        eq(schema.contactTags.contactId, contactId),
        inArray(schema.contactTags.tagId, toRemove),
        exists(
          database
            .select({ id: schema.contacts.id })
            .from(schema.contacts)
            .where(
              and(
                eq(schema.contacts.id, schema.contactTags.contactId),
                eq(schema.contacts.accountId, accountId)
              )
            )
        )
      )
    );
  }
  if (toAdd.length > 0) {
    await database
      .insert(schema.contactTags)
      .values(toAdd.map((tagId) => ({ contactId, tagId })))
      .onConflictDoNothing({
        target: [schema.contactTags.contactId, schema.contactTags.tagId],
      });
  }
  return toAdd;
}

export async function setContactTags(
  database: ApiDatabase,
  accountId: string,
  auditUserId: string,
  contactId: string,
  tagNames: string[]
): Promise<void> {
  let added: string[] = [];
  try {
    if (database.transaction) {
      await database.transaction(async (tx) => {
        added = await syncContactTags(
          tx,
          accountId,
          auditUserId,
          contactId,
          tagNames
        );
      });
    } else {
      added = await syncContactTags(
        database,
        accountId,
        auditUserId,
        contactId,
        tagNames
      );
    }
  } catch (error) {
    if (error instanceof ContactError) throw error;
    console.error('[api/v1/contacts] tag update failed:', error);
    throw new ContactError('Failed to update contact tags', 500);
  }

  await Promise.allSettled(
    added.map((tagId) =>
      runAutomationsForTrigger({
        accountId,
        triggerType: 'tag_added',
        contactId,
        context: { tag_id: tagId, vars: { _tag_chain_depth: 1 } },
      })
    )
  );
}

export async function getContactById(
  database: WhatsAppQueryDb,
  accountId: string,
  contactId: string
): Promise<ApiContact | null> {
  const [row] = await database
    .select(contactFields())
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.id, contactId),
        eq(schema.contacts.accountId, accountId)
      )
    )
    .limit(1);
  if (!row) return null;
  return (await hydrateContactTags(database, accountId, [row]))[0] ?? null;
}

export async function createContactWithTags(
  database: typeof appDb,
  accountId: string,
  input: ContactInput,
  tagNames: string[] | null
): Promise<{ contact: ApiContact | null; created: boolean }> {
  let addedTags: string[] = [];
  const result = await database.transaction(async (tx) => {
    const auditUserId = await resolveAuditUserId(tx, accountId);
    const created = await findOrCreateContact(
      tx,
      accountId,
      auditUserId,
      input
    );
    if (tagNames) {
      addedTags = await syncContactTags(
        tx,
        accountId,
        auditUserId,
        created.id,
        tagNames
      );
    }
    return created;
  });
  await Promise.allSettled(
    addedTags.map((tagId) =>
      runAutomationsForTrigger({
        accountId,
        triggerType: 'tag_added',
        contactId: result.id,
        context: { tag_id: tagId, vars: { _tag_chain_depth: 1 } },
      })
    )
  );
  return {
    contact: await getContactById(database, accountId, result.id),
    created: result.created,
  };
}

export async function updateContact(
  database: typeof appDb,
  accountId: string,
  contactId: string,
  updates: {
    name?: string | null;
    email?: string | null;
    company?: string | null;
  },
  tagNames: string[] | null
): Promise<ApiContact | null> {
  let addedTags: string[] = [];
  const found = await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.id, contactId),
          eq(schema.contacts.accountId, accountId)
        )
      )
      .limit(1);
    if (!existing) return false;

    if (Object.keys(updates).length > 0) {
      await tx
        .update(schema.contacts)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(
          and(
            eq(schema.contacts.id, contactId),
            eq(schema.contacts.accountId, accountId)
          )
        );
    }
    if (tagNames) {
      const auditUserId = await resolveAuditUserId(tx, accountId);
      addedTags = await syncContactTags(
        tx,
        accountId,
        auditUserId,
        contactId,
        tagNames
      );
    }
    return true;
  });
  if (!found) return null;
  await Promise.allSettled(
    addedTags.map((tagId) =>
      runAutomationsForTrigger({
        accountId,
        triggerType: 'tag_added',
        contactId,
        context: { tag_id: tagId, vars: { _tag_chain_depth: 1 } },
      })
    )
  );
  return getContactById(database, accountId, contactId);
}
