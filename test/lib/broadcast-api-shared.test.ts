import { describe, expect, it } from 'bun:test';
import {
  parseAudience,
  parseVariables,
  resolveVariables,
} from '@/app/api/whatsapp/broadcast/_shared';
import type { Contact } from '@/types';

const contact: Contact = {
  id: 'contact-1',
  user_id: 'user-1',
  account_id: 'account-1',
  phone: '+14155550123',
  name: 'Ada',
  email: 'ada@example.com',
  company: 'Analytical Engines',
  created_at: '',
  updated_at: '',
};

describe('dashboard broadcast API input parsing', () => {
  it('rejects missing and unknown audience types', () => {
    expect(parseAudience(null)).toBeNull();
    expect(parseAudience({ type: 'everyone' })).toBeNull();
  });

  it('keeps only valid audience identifiers and CSV rows', () => {
    expect(
      parseAudience({
        type: 'csv',
        tagIds: ['tag-1', 'tag-1', null],
        csvContacts: [
          { phone: ' +14155550123 ', name: ' Ada ' },
          { phone: '' },
          null,
        ],
      })
    ).toEqual({
      type: 'csv',
      tagIds: ['tag-1'],
      customField: undefined,
      csvContacts: [{ phone: '+14155550123', name: 'Ada' }],
      excludeTagIds: [],
    });
  });

  it('drops malformed variable mappings', () => {
    expect(
      parseVariables({
        1: { type: 'field', value: 'name' },
        2: { type: 'unknown', value: 'phone' },
        3: 'invalid',
      })
    ).toEqual({ 1: { type: 'field', value: 'name' } });
  });
});

describe('dashboard broadcast variable resolution', () => {
  it('orders placeholders and resolves contact/custom/static values', () => {
    expect(
      resolveVariables(
        {
          10: { type: 'static', value: 'fin' },
          2: { type: 'custom_field', value: 'field-1' },
          1: { type: 'field', value: 'name' },
        },
        contact,
        new Map([['field-1', 'VIP']])
      )
    ).toEqual(['Ada', 'VIP', 'fin']);
  });
});
