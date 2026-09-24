import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { hoisted } from '@test/support/mocks';

const mocks = hoisted(() => ({
  getCurrentAccount: mock(),
  queryActivity: mock(),
  queryConversationsSeries: mock(),
  queryMetrics: mock(),
  queryPipelineDonut: mock(),
  queryResponseTime: mock(),
}));

mock.module('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: mock(() =>
    Response.json({ error: 'auth failed' }, { status: 401 })
  ),
}));

mock.module('@/app/api/dashboard/_queries', () => ({
  queryActivity: mocks.queryActivity,
  queryConversationsSeries: mocks.queryConversationsSeries,
  queryMetrics: mocks.queryMetrics,
  queryPipelineDonut: mocks.queryPipelineDonut,
  queryResponseTime: mocks.queryResponseTime,
}));

import { GET as getActivity } from '@/app/api/dashboard/activity/route';
import { GET as getConversations } from '@/app/api/dashboard/conversations/route';
import { GET as getMetrics } from '@/app/api/dashboard/metrics/route';
import { GET as getPipeline } from '@/app/api/dashboard/pipeline/route';
import { GET as getResponseTime } from '@/app/api/dashboard/response-time/route';

const database = { name: 'drizzle-database' };
const context = {
  db: database,
  accountId: 'account-1',
  userId: 'user-1',
  role: 'agent',
  systemRole: 'user',
  account: { id: 'account-1', name: 'Acme' },
};

beforeEach(() => {
  mocks.getCurrentAccount.mockReset();
  mocks.queryActivity.mockReset();
  mocks.queryConversationsSeries.mockReset();
  mocks.queryMetrics.mockReset();
  mocks.queryPipelineDonut.mockReset();
  mocks.queryResponseTime.mockReset();
  mocks.getCurrentAccount.mockResolvedValue(context);
});

describe('/api/dashboard tenant context', () => {
  it('derives metrics tenancy from the authenticated account', async () => {
    const payload = {
      activeConversations: { current: 2, previous: 1 },
      newContactsToday: { current: 3, previous: 2 },
      openDealsValue: 50,
      openDealsCount: 1,
      messagesSentToday: { current: 4, previous: 3 },
    };
    mocks.queryMetrics.mockResolvedValue(payload);

    const response = await getMetrics();

    expect(response.status).toBe(200);
    expect(mocks.queryMetrics).toHaveBeenCalledWith(database, 'account-1');
    expect(await response.json()).toEqual(payload);
  });

  it('only accepts supported conversation ranges', async () => {
    mocks.queryConversationsSeries.mockResolvedValue([]);

    const valid = await getConversations(
      new Request('http://localhost/api/dashboard/conversations?range=90')
    );
    const invalid = await getConversations(
      new Request('http://localhost/api/dashboard/conversations?range=365')
    );

    expect(valid.status).toBe(200);
    expect(mocks.queryConversationsSeries).toHaveBeenCalledTimes(1);
    expect(mocks.queryConversationsSeries).toHaveBeenCalledWith(
      database,
      'account-1',
      90
    );
    expect(invalid.status).toBe(400);
  });

  it('caps activity and scopes every remaining widget', async () => {
    mocks.queryActivity.mockResolvedValue([]);
    mocks.queryPipelineDonut.mockResolvedValue({ stages: [], totalValue: 0 });
    mocks.queryResponseTime.mockResolvedValue({
      buckets: [],
      thisWeekAvg: null,
      lastWeekAvg: null,
    });

    const [activity, pipeline, responseTime] = await Promise.all([
      getActivity(
        new Request('http://localhost/api/dashboard/activity?limit=500')
      ),
      getPipeline(),
      getResponseTime(),
    ]);

    expect(activity.status).toBe(200);
    expect(pipeline.status).toBe(200);
    expect(responseTime.status).toBe(200);
    expect(mocks.queryActivity).toHaveBeenCalledWith(database, 'account-1', 50);
    expect(mocks.queryPipelineDonut).toHaveBeenCalledWith(
      database,
      'account-1'
    );
    expect(mocks.queryResponseTime).toHaveBeenCalledWith(database, 'account-1');
  });
});
