import { NextResponse } from 'next/server';
import { queryActivity } from '@/app/api/dashboard/_queries';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  try {
    const { db, accountId } = await getCurrentAccount();
    const requested = Number.parseInt(
      new URL(request.url).searchParams.get('limit') ?? String(DEFAULT_LIMIT),
      10
    );
    const limit = Number.isFinite(requested)
      ? Math.min(MAX_LIMIT, Math.max(1, requested))
      : DEFAULT_LIMIT;
    return NextResponse.json(await queryActivity(db, accountId, limit));
  } catch (error) {
    return toErrorResponse(error);
  }
}
