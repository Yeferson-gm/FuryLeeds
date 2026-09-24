import { describe, expect, it } from 'bun:test';
import { BroadcastError, createBroadcast } from '@/lib/api/v1/broadcasts';

const noopDb = {} as Parameters<typeof createBroadcast>[0];

describe('createBroadcast validation', () => {
  it('rejects a missing template before querying the database', async () => {
    await expect(
      createBroadcast(noopDb, 'account', 'user', {
        templateName: '',
        recipients: [{ to: '+14155550123' }],
      })
    ).rejects.toMatchObject({
      code: 'bad_request',
      status: 400,
    } satisfies Partial<BroadcastError>);
  });

  it('rejects an empty recipient list before querying the database', async () => {
    await expect(
      createBroadcast(noopDb, 'account', 'user', {
        templateName: 'promo',
        recipients: [],
      })
    ).rejects.toBeInstanceOf(BroadcastError);
  });
});
