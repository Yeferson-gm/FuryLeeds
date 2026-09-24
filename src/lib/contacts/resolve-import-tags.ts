import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db';
import type { ContactsDb } from './repository';

const DEFAULT_TAG_COLOR = '#3b82f6';

export interface ResolveImportTagsResult {
  tagIdByKey: Map<string, string>;
  skippedNames: string[];
}

export async function resolveImportTagIds(
  database: ContactsDb,
  params: {
    accountId: string;
    userId: string;
    tagNames: string[];
    canCreateTags: boolean;
    defaultColor?: string;
  }
): Promise<ResolveImportTagsResult> {
  const { accountId, userId, tagNames, canCreateTags } = params;
  const defaultColor = params.defaultColor ?? DEFAULT_TAG_COLOR;
  const uniqueNames: string[] = [];
  const seen = new Set<string>();

  for (const raw of tagNames) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    uniqueNames.push(name);
  }

  if (uniqueNames.length === 0) {
    return { tagIdByKey: new Map(), skippedNames: [] };
  }

  const existing = await database
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(eq(schema.tags.accountId, accountId));

  const tagIdByKey = new Map<string, string>();
  for (const tag of existing) {
    const key = tag.name.trim().toLowerCase();
    if (!tagIdByKey.has(key)) tagIdByKey.set(key, tag.id);
  }

  const skippedNames: string[] = [];
  const toCreate: string[] = [];
  for (const name of uniqueNames) {
    if (tagIdByKey.has(name.toLowerCase())) continue;
    if (canCreateTags) toCreate.push(name);
    else skippedNames.push(name);
  }

  if (toCreate.length > 0) {
    const created = await database
      .insert(schema.tags)
      .values(
        toCreate.map((name) => ({
          userId,
          accountId,
          name,
          color: defaultColor,
        }))
      )
      .returning({ id: schema.tags.id, name: schema.tags.name });

    for (const tag of created) {
      tagIdByKey.set(tag.name.trim().toLowerCase(), tag.id);
    }
  }

  return { tagIdByKey, skippedNames };
}

export interface ContactTagAssignment {
  contactId: string;
  tagNames: string[];
}

export async function assignImportedContactTags(
  database: ContactsDb,
  assignments: ContactTagAssignment[],
  tagIdByKey: Map<string, string>
): Promise<number> {
  const rows: Array<{ contactId: string; tagId: string }> = [];
  for (const { contactId, tagNames } of assignments) {
    const assigned = new Set<string>();
    for (const name of tagNames) {
      const tagId = tagIdByKey.get(name.trim().toLowerCase());
      if (!tagId || assigned.has(tagId)) continue;
      assigned.add(tagId);
      rows.push({ contactId, tagId });
    }
  }

  if (rows.length === 0) return 0;

  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    await database
      .insert(schema.contactTags)
      .values(chunk)
      .onConflictDoNothing({
        target: [schema.contactTags.contactId, schema.contactTags.tagId],
      });
  }

  return rows.length;
}
