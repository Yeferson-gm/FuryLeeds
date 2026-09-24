import { describe, expect, it, mock } from 'bun:test';
import { BroadcastError } from '@/lib/whatsapp/broadcast-core';
import {
  claimBroadcastDelivery,
  planBroadcastResume,
  releaseBroadcastDelivery,
} from '@/lib/whatsapp/broadcast-resume';
import { createDrizzleMock } from './drizzle-mock';

mock.module('@/lib/whatsapp/encryption', () => ({
  decrypt: (value: string) => `decrypted:${value}`,
}));

describe('broadcast delivery lock', () => {
  it('claims only when UPDATE RETURNING matched a row', async () => {
    const claimed = createDrizzleMock({
      update: { broadcasts: [[{ id: 'b-1' }]] },
    });
    expect(
      await claimBroadcastDelivery(
        claimed.db,
        'acct-1',
        'b-1',
        new Date('2026-08-11T12:00:00Z')
      )
    ).toBe(true);
    expect(claimed.calls[0].values).toEqual({
      deliveryLockedAt: '2026-08-11T12:00:00.000Z',
    });

    const busy = createDrizzleMock({ update: { broadcasts: [[]] } });
    expect(await claimBroadcastDelivery(busy.db, 'acct-1', 'b-1')).toBe(false);
  });

  it('releases the lock', async () => {
    const { db, calls } = createDrizzleMock();
    await releaseBroadcastDelivery(db, 'b-1');
    expect(calls[0].values).toEqual({ deliveryLockedAt: null });
  });
});

const BROADCAST = {
  id: 'b-1',
  templateName: 'order_update',
  templateLanguage: 'en_US',
};
const CONFIG = { phoneNumberId: 'pn-1', accessToken: 'token' };

function planDb(recipients: unknown[], templates: unknown[] = []) {
  return createDrizzleMock({
    select: {
      broadcasts: [[BROADCAST]],
      broadcastRecipients: [recipients],
      whatsappConfig: [[CONFIG]],
      messageTemplates: [templates],
    },
  });
}

describe('planBroadcastResume', () => {
  it('plans sendable recipients with frozen params', async () => {
    const { db } = planDb([
      { id: 'r1', phone: '+15551234567', templateParams: ['A123'] },
      { id: 'r2', phone: '+15559876543', templateParams: null },
    ]);
    const result = await planBroadcastResume(db, 'acct-1', 'b-1', 'pending');
    expect(result.plan.planned).toEqual([
      { recipientRowId: 'r1', phone: '15551234567', params: ['A123'] },
      { recipientRowId: 'r2', phone: '15559876543', params: [] },
    ]);
    expect(result.plan.accessToken).toBe('decrypted:token');
  });

  it('marks unusable recipients failed', async () => {
    const fixture = planDb([
      { id: 'r1', phone: '+15551234567', templateParams: [] },
      { id: 'r2', phone: null, templateParams: [] },
    ]);
    const result = await planBroadcastResume(
      fixture.db,
      'acct-1',
      'b-1',
      'pending'
    );
    expect(result.unsendable).toBe(1);
    expect(
      fixture.calls.find(
        (call) => call.kind === 'update' && call.table === 'broadcastRecipients'
      )?.values
    ).toMatchObject({ status: 'failed' });
  });

  it('404s a missing broadcast and rejects an empty backlog', async () => {
    const missing = createDrizzleMock({ select: { broadcasts: [[]] } });
    await expect(
      planBroadcastResume(missing.db, 'acct-1', 'b-1', 'pending')
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      planBroadcastResume(planDb([]).db, 'acct-1', 'b-1', 'failed')
    ).rejects.toBeInstanceOf(BroadcastError);
  });
});
