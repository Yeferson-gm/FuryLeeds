import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { hoisted } from '@test/support/mocks';

const mocks = hoisted(() => ({
  requireRole: mock(),
}));

mock.module('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: mock(() =>
    Response.json({ error: 'auth failed' }, { status: 403 })
  ),
}));

import { isDealStatus, readDealPayload } from '@/app/api/pipelines/_shared';
import { POST as createDeal } from '@/app/api/pipelines/[id]/deals/route';
import { POST as createPipeline } from '@/app/api/pipelines/route';

const context = {
  db: {},
  accountId: 'account-1',
  userId: 'user-1',
  role: 'admin',
  systemRole: 'user',
  account: { id: 'account-1', name: 'Acme' },
};

beforeEach(() => {
  mocks.requireRole.mockReset();
  mocks.requireRole.mockResolvedValue(context);
});

describe('/api/pipelines authorization and validation', () => {
  it('requires admin before creating a pipeline', async () => {
    const response = await createPipeline(
      new Request('http://localhost/api/pipelines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      })
    );

    expect(mocks.requireRole).toHaveBeenCalledWith('admin');
    expect(response.status).toBe(400);
  });

  it('derives pipeline tenancy from requireRole and ignores client IDs', async () => {
    const pipelineValues = mock();
    const stageValues = mock();
    const transaction = mock(async (callback: (tx: unknown) => unknown) =>
      callback({
        insert: mock(() => ({
          values: (values: unknown) => {
            if (pipelineValues.mock.calls.length === 0) {
              pipelineValues(values);
              return {
                returning: async () => [
                  {
                    id: 'pipeline-1',
                    accountId: 'account-1',
                    userId: 'user-1',
                    name: 'Ventas',
                    createdAt: '2026-01-01T00:00:00.000Z',
                  },
                ],
              };
            }
            stageValues(values);
            return Promise.resolve();
          },
        })),
      })
    );
    mocks.requireRole.mockResolvedValue({
      ...context,
      db: { transaction },
    });

    const response = await createPipeline(
      new Request('http://localhost/api/pipelines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Ventas',
          account_id: 'attacker-account',
          user_id: 'attacker-user',
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(pipelineValues).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      name: 'Ventas',
    });
    expect(stageValues).toHaveBeenCalledTimes(1);
  });

  it('requires agent before creating operational deal data', async () => {
    const response = await createDeal(
      new Request('http://localhost/api/pipelines/pipeline-1/deals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      }),
      { params: Promise.resolve({ id: 'pipeline-1' }) }
    );

    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(response.status).toBe(400);
  });
});

describe('deal payload contract', () => {
  it('normalizes valid values without accepting tenant identifiers', () => {
    expect(
      readDealPayload({
        title: '  Renovación  ',
        value: '125.5',
        currency: 'usd',
        contact_id: 'contact-1',
        stage_id: 'stage-1',
        assigned_to: '',
        notes: '  seguimiento  ',
        account_id: 'attacker-account',
        user_id: 'attacker-user',
      })
    ).toEqual({
      title: 'Renovación',
      value: '125.50',
      currency: 'USD',
      contactId: 'contact-1',
      stageId: 'stage-1',
      assignedTo: null,
      notes: 'seguimiento',
      expectedCloseDate: null,
    });
  });

  it('rejects malformed values and only accepts known statuses', () => {
    expect(
      readDealPayload({
        title: 'Deal',
        value: -1,
        currency: 'USD',
        contact_id: 'contact-1',
        stage_id: 'stage-1',
      })
    ).toBeNull();
    expect(isDealStatus('won')).toBe(true);
    expect(isDealStatus('deleted')).toBe(false);
  });
});
