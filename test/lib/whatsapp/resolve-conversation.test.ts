import { describe, expect, it } from 'bun:test';
import type { WhatsAppDb } from '@/lib/whatsapp/db';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { SendMessageError } from '@/lib/whatsapp/send-message';
import { createDrizzleMock } from './drizzle-mock';

describe('resolveConversationByPhone', () => {
  it('rejects invalid and national-format phones before querying', async () => {
    const noDb = {} as WhatsAppDb;
    await expect(
      resolveConversationByPhone(noDb, 'acct', 'not-a-phone')
    ).rejects.toBeInstanceOf(SendMessageError);
    await expect(
      resolveConversationByPhone(noDb, 'acct', '4155551212')
    ).rejects.toMatchObject({ code: 'bad_request', status: 400 });
  });

  it('fails when WhatsApp is not configured', async () => {
    const { db } = createDrizzleMock({
      select: { whatsappConfig: [[]] },
    });
    await expect(
      resolveConversationByPhone(db, 'acct', '+14155550123')
    ).rejects.toMatchObject({ code: 'whatsapp_not_configured' });
  });

  it('returns an existing contact and conversation', async () => {
    const { db, calls } = createDrizzleMock({
      select: {
        whatsappConfig: [[{ id: 'cfg' }], [{ userId: 'owner-1' }]],
        contacts: [
          [
            {
              id: 'c1',
              phone: '14155550123',
              name: 'Jane',
              waUserId: null,
            },
          ],
        ],
        conversations: [[{ id: 'cv1' }]],
      },
    });
    expect(
      await resolveConversationByPhone(db, 'acct', '+1 (415) 555-0123')
    ).toEqual({
      conversationId: 'cv1',
      contactId: 'c1',
      contactCreated: false,
    });
    expect(calls.some((call) => call.kind === 'insert')).toBe(false);
  });

  it('creates contact and conversation when neither exists', async () => {
    const { db } = createDrizzleMock({
      select: {
        whatsappConfig: [[{ id: 'cfg' }], [{ userId: 'owner-1' }]],
        contacts: [[]],
        conversations: [[]],
      },
      insert: {
        contacts: [[{ id: 'c2' }]],
        conversations: [[{ id: 'cv2' }]],
      },
    });
    expect(
      await resolveConversationByPhone(db, 'acct', '+14155550199', 'Jane')
    ).toEqual({
      conversationId: 'cv2',
      contactId: 'c2',
      contactCreated: true,
    });
  });
});
