import { describe, expect, it } from 'bun:test';
import type { ContactsDb } from '@/lib/contacts/repository';
import { addContactTagIfAbsent } from '@/lib/contacts/tag-write';
import { schema } from '@/lib/db';

interface FakeOptions {
  contact?: { id: string } | null;
  tag?: { id: string } | null;
  inserted?: boolean;
  insertError?: Error;
}

function fakeDb(options: FakeOptions = {}): ContactsDb {
  const contact =
    options.contact === undefined ? { id: 'contact-1' } : options.contact;
  const tag = options.tag === undefined ? { id: 'tag-1' } : options.tag;

  return {
    select() {
      let table: unknown;
      const builder = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where() {
          return builder;
        },
        async limit() {
          if (table === schema.contacts) return contact ? [contact] : [];
          if (table === schema.tags) return tag ? [tag] : [];
          return [];
        },
      };
      return builder;
    },
    insert() {
      const builder = {
        values() {
          return builder;
        },
        onConflictDoNothing() {
          return builder;
        },
        async returning() {
          if (options.insertError) throw options.insertError;
          return options.inserted === false ? [] : [{ id: 'join-1' }];
        },
      };
      return builder;
    },
  } as unknown as ContactsDb;
}

const input = {
  accountId: 'account-1',
  contactId: 'contact-1',
  tagId: 'tag-1',
};

describe('addContactTagIfAbsent', () => {
  it('returns true only when the join row was inserted', async () => {
    await expect(addContactTagIfAbsent(fakeDb(), input)).resolves.toBe(true);
    await expect(
      addContactTagIfAbsent(fakeDb({ inserted: false }), input)
    ).resolves.toBe(false);
  });

  it('refuses contacts and tags outside the account', async () => {
    await expect(
      addContactTagIfAbsent(fakeDb({ contact: null }), input)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      addContactTagIfAbsent(fakeDb({ tag: null }), input)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('surfaces insert failures', async () => {
    const db = fakeDb({ insertError: new Error('permission denied') });
    await expect(addContactTagIfAbsent(db, input)).rejects.toThrow(
      'Failed to add contact tag: permission denied'
    );
  });
});
