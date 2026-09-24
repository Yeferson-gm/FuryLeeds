import { and, eq } from 'drizzle-orm';
import { schema } from '@/lib/db';
import type { ContactsDb } from './repository';

export class ContactTagWriteError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ContactTagWriteError';
    this.status = status;
  }
}

interface ContactTagWriteInput {
  accountId: string;
  contactId: string;
  tagId: string;
}

async function assertContactAndTagOwnership(
  database: ContactsDb,
  input: ContactTagWriteInput
): Promise<void> {
  const [contacts, tags] = await Promise.all([
    database
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.id, input.contactId),
          eq(schema.contacts.accountId, input.accountId)
        )
      )
      .limit(1),
    database
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(
        and(
          eq(schema.tags.id, input.tagId),
          eq(schema.tags.accountId, input.accountId)
        )
      )
      .limit(1),
  ]);

  if (!contacts[0]) throw new ContactTagWriteError('Contact not found', 404);
  if (!tags[0]) throw new ContactTagWriteError('Tag not found', 404);
}

export async function addContactTagIfAbsent(
  database: ContactsDb,
  input: ContactTagWriteInput
): Promise<boolean> {
  await assertContactAndTagOwnership(database, input);

  try {
    const inserted = await database
      .insert(schema.contactTags)
      .values({ contactId: input.contactId, tagId: input.tagId })
      .onConflictDoNothing({
        target: [schema.contactTags.contactId, schema.contactTags.tagId],
      })
      .returning({ id: schema.contactTags.id });
    return inserted.length > 0;
  } catch (error) {
    throw new ContactTagWriteError(
      `Failed to add contact tag: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

export async function removeContactTag(
  database: ContactsDb,
  input: ContactTagWriteInput
): Promise<void> {
  await assertContactAndTagOwnership(database, input);

  await database
    .delete(schema.contactTags)
    .where(
      and(
        eq(schema.contactTags.contactId, input.contactId),
        eq(schema.contactTags.tagId, input.tagId)
      )
    );
}
