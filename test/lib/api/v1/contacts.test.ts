import { describe, expect, it, mock } from 'bun:test';
import { asThenable } from '@test/support/mocks';

mock.module('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: mock(async () => undefined),
}));

import {
  ContactError,
  findOrCreateContact,
  serializeContact,
  setContactTags,
} from '@/lib/api/v1/contacts';

describe('serializeContact', () => {
  it('flattens tag joins and nulls missing fields', () => {
    expect(
      serializeContact({
        id: 'c1',
        phone: '+14155550123',
        name: 'Jane',
        email: null,
        company: 'Acme',
        avatar_url: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        contact_tags: [
          { tags: { id: 't1', name: 'vip', color: '#fff' } },
          { tags: null },
        ],
      })
    ).toEqual({
      id: 'c1',
      phone: '+14155550123',
      name: 'Jane',
      email: null,
      company: 'Acme',
      avatar_url: null,
      tags: [{ id: 't1', name: 'vip', color: '#fff' }],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    });
  });

  it('tolerates a row with no tag joins', () => {
    expect(
      serializeContact({
        id: 'c2',
        phone: '+1',
        created_at: 'a',
        updated_at: 'b',
      }).tags
    ).toEqual([]);
  });
});

describe('findOrCreateContact', () => {
  const noopDb = {} as Parameters<typeof findOrCreateContact>[0];

  it('rejects malformed or ambiguous phones before a DB call', async () => {
    for (const phone of [
      'not-a-number',
      '4155551212',
      '14155551212',
      '+1234567',
    ]) {
      await expect(
        findOrCreateContact(noopDb, 'acc', 'user', { phone })
      ).rejects.toBeInstanceOf(ContactError);
      await expect(
        findOrCreateContact(noopDb, 'acc', 'user', { phone })
      ).rejects.toMatchObject({ status: 400 });
    }
  });
});

describe('setContactTags', () => {
  function fakeDb(currentTagIds: string[]) {
    const removed: string[][] = [];
    const inserted: Array<Record<string, string>> = [];
    let selectCall = 0;

    const select = () => {
      selectCall++;
      const result =
        selectCall === 1
          ? [{ id: 'c1' }]
          : selectCall === 2
            ? [
                { id: 'tag-a', name: 'A' },
                { id: 'tag-b', name: 'B' },
                { id: 'tag-c', name: 'C' },
              ]
            : currentTagIds.map((tagId) => ({ tagId }));
      const builder: Record<string, unknown> = {};
      builder.from = () => builder;
      builder.innerJoin = () => builder;
      builder.where = () => builder;
      builder.limit = () => Promise.resolve(result.slice(0, 1));
      return asThenable(builder, () => result);
    };

    const database = {
      select,
      insert: () => ({
        values: (rows: Array<Record<string, string>>) => {
          inserted.push(...rows);
          return {
            returning: async () => [],
            onConflictDoNothing: async () => undefined,
          };
        },
      }),
      delete: () => ({
        where: async (condition: unknown) => {
          removed.push(currentTagIds);
          return condition;
        },
      }),
    } as unknown as Parameters<typeof setContactTags>[0];
    return { database, inserted, removed };
  }

  it('adds requested tags and removes joins outside the desired set', async () => {
    const { database, inserted, removed } = fakeDb(['tag-c']);
    await setContactTags(database, 'acc', 'user', 'c1', [' A ', 'a', 'B']);
    expect(inserted).toEqual([
      { contactId: 'c1', tagId: 'tag-a' },
      { contactId: 'c1', tagId: 'tag-b' },
    ]);
    expect(removed).toHaveLength(1);
  });

  it('clears all current tags for an empty desired list', async () => {
    const { database, inserted, removed } = fakeDb(['tag-a', 'tag-c']);
    await setContactTags(database, 'acc', 'user', 'c1', []);
    expect(inserted).toEqual([]);
    expect(removed).toHaveLength(1);
  });
});
