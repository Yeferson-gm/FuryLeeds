import { and, desc, eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  daysAgoStart,
  lastNDayKeys,
  localDayKey,
} from '@/lib/dashboard/date-utils';
import { schema } from '@/lib/db';

const MAX_ROWS = 10_000;
const DEFAULT_WINDOW_DAYS = 30;

interface UsageRow {
  created_at: string;
  mode: 'auto_reply' | 'draft';
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export async function GET(request: Request) {
  try {
    const { db, accountId } = await requireRole('admin');
    const url = new URL(request.url);
    const rawDays = Number(url.searchParams.get('days'));
    const days =
      Number.isFinite(rawDays) && rawDays >= 1
        ? Math.min(90, Math.floor(rawDays))
        : DEFAULT_WINDOW_DAYS;
    const since = daysAgoStart(days - 1);

    let all: UsageRow[];
    try {
      all = (await db
        .select({
          created_at: schema.aiUsageLog.createdAt,
          mode: schema.aiUsageLog.mode,
          provider: schema.aiUsageLog.provider,
          model: schema.aiUsageLog.model,
          prompt_tokens: schema.aiUsageLog.promptTokens,
          completion_tokens: schema.aiUsageLog.completionTokens,
          total_tokens: schema.aiUsageLog.totalTokens,
        })
        .from(schema.aiUsageLog)
        .where(
          and(
            eq(schema.aiUsageLog.accountId, accountId),
            gte(schema.aiUsageLog.createdAt, since.toISOString())
          )
        )
        .orderBy(desc(schema.aiUsageLog.createdAt))
        .limit(MAX_ROWS + 1)) as UsageRow[];
    } catch (error) {
      console.error('[ai/usage GET] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load usage' },
        { status: 500 }
      );
    }

    const truncated = all.length > MAX_ROWS;
    const rows = truncated ? all.slice(0, MAX_ROWS) : all;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    const byMode = {
      auto_reply: { calls: 0, tokens: 0 },
      draft: { calls: 0, tokens: 0 },
    };
    const modelMap = new Map<
      string,
      { model: string; provider: string; calls: number; tokens: number }
    >();
    const daily = new Map<
      string,
      { date: string; tokens: number; calls: number }
    >();
    for (const key of lastNDayKeys(days)) {
      daily.set(key, { date: key, tokens: 0, calls: 0 });
    }

    for (const row of rows) {
      promptTokens += row.prompt_tokens;
      completionTokens += row.completion_tokens;
      totalTokens += row.total_tokens;
      byMode[row.mode].calls += 1;
      byMode[row.mode].tokens += row.total_tokens;

      const modelKey = `${row.provider}:${row.model}`;
      const model = modelMap.get(modelKey) ?? {
        model: row.model,
        provider: row.provider,
        calls: 0,
        tokens: 0,
      };
      model.calls += 1;
      model.tokens += row.total_tokens;
      modelMap.set(modelKey, model);

      const bucket = daily.get(localDayKey(row.created_at));
      if (bucket) {
        bucket.tokens += row.total_tokens;
        bucket.calls += 1;
      }
    }

    return NextResponse.json({
      window_days: days,
      truncated,
      totals: {
        calls: rows.length,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      },
      by_mode: byMode,
      by_model: [...modelMap.values()].sort((a, b) => b.tokens - a.tokens),
      daily: [...daily.values()],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
