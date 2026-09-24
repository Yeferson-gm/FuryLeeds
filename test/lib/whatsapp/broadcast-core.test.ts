import { describe, expect, it, mock } from 'bun:test';
import {
  BroadcastError,
  createBroadcast,
  finalizeBroadcastStatus,
} from '@/lib/whatsapp/broadcast-core';
import type { WhatsAppDb } from '@/lib/whatsapp/db';
import { createDrizzleMock } from './drizzle-mock';

mock.module('@/lib/whatsapp/encryption', () => ({
  decrypt: () => 'plain-access-token',
}));

const noDb = {} as WhatsAppDb;

describe('createBroadcast validation', () => {
  it('rejects missing template and recipients', async () => {
    await expect(
      createBroadcast(noDb, 'acc', 'user', {
        templateName: '',
        recipients: [{ to: '+14155550123' }],
      })
    ).rejects.toMatchObject({ code: 'bad_request', status: 400 });
    await expect(
      createBroadcast(noDb, 'acc', 'user', {
        templateName: 'promo',
        recipients: [],
      })
    ).rejects.toBeInstanceOf(BroadcastError);
  });

  it('caps one request at 1000 recipients', async () => {
    const recipients = Array.from({ length: 1001 }, () => ({
      to: '+14155550123',
    }));
    await expect(
      createBroadcast(noDb, 'acc', 'user', {
        templateName: 'promo',
        recipients,
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

function broadcastDb(transactionError?: unknown) {
  return createDrizzleMock({
    select: {
      whatsappConfig: [[{ phoneNumberId: 'pn-1', accessToken: 'enc' }]],
      messageTemplates: [[]],
      contacts: [
        [
          {
            id: 'c1',
            phone: '14155550123',
            name: null,
            waUserId: null,
          },
        ],
      ],
    },
    insert: {
      broadcasts: [[{ id: 'b-1' }]],
      broadcastRecipients: [[{ recipientId: 'r-1', contactId: 'c1' }]],
    },
    transactionError,
  });
}

describe('createBroadcast persistence', () => {
  it('creates parent and recipients in one Drizzle transaction', async () => {
    const { db, calls } = broadcastDb();
    const plan = await createBroadcast(db, 'acc', 'user', {
      templateName: 'promo',
      recipients: [
        { to: '4155551212' },
        { to: '+14155550123', params: ['Ada'] },
      ],
    });

    expect(plan.rejected).toBe(1);
    expect(plan.broadcastId).toBe('b-1');
    expect(plan.planned).toEqual([
      { recipientRowId: 'r-1', phone: '14155550123', params: ['Ada'] },
    ]);
    expect(
      calls.filter((call) => call.kind === 'insert').map((call) => call.table)
    ).toEqual(['broadcasts', 'broadcastRecipients']);
  });

  it('surfaces a failed transaction without an orphan plan', async () => {
    const { db } = broadcastDb(new Error('recipient insert failed'));
    await expect(
      createBroadcast(db, 'acc', 'user', {
        templateName: 'promo',
        recipients: [{ to: '+14155550123' }],
      })
    ).rejects.toMatchObject({ code: 'internal', status: 500 });
  });
});

describe('finalizeBroadcastStatus', () => {
  it('keeps sending while pending recipients remain', async () => {
    const { db, calls } = createDrizzleMock({
      select: { broadcastRecipients: [[{ value: 2 }]] },
    });
    await finalizeBroadcastStatus(db, 'b-1');
    expect(calls.some((call) => call.kind === 'update')).toBe(false);
  });

  it('marks a partially failed campaign sent', async () => {
    const { db, calls } = createDrizzleMock({
      select: {
        broadcastRecipients: [[{ value: 0 }], [{ value: 3 }], [{ value: 10 }]],
      },
    });
    await finalizeBroadcastStatus(db, 'b-1');
    expect(
      calls.find(
        (call) => call.kind === 'update' && call.table === 'broadcasts'
      )?.values
    ).toMatchObject({ status: 'sent' });
  });
});
