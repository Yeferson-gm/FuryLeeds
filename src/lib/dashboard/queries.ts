import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from './types';

async function dashboardRequest<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ?? `Dashboard request failed (${response.status})`
    );
  }
  return (await response.json()) as T;
}

export function loadMetrics(): Promise<MetricsBundle> {
  return dashboardRequest('/api/dashboard/metrics');
}

export function loadConversationsSeries(
  rangeDays: 7 | 30 | 90
): Promise<ConversationsSeriesPoint[]> {
  return dashboardRequest(`/api/dashboard/conversations?range=${rangeDays}`);
}

export function loadPipelineDonut(): Promise<PipelineDonutData> {
  return dashboardRequest('/api/dashboard/pipeline');
}

export function loadResponseTime(): Promise<ResponseTimeSummary> {
  return dashboardRequest('/api/dashboard/response-time');
}

export function loadActivity(limit = 20): Promise<ActivityItem[]> {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit) || 20));
  return dashboardRequest(`/api/dashboard/activity?limit=${safeLimit}`);
}
