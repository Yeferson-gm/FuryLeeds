import { NextResponse } from 'next/server';
import { queryConversationsSeries } from '@/app/api/dashboard/_queries';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

const VALID_RANGES = new Set([7, 30, 90]);

export async function GET(request: Request) {
  try {
    const { db, accountId } = await getCurrentAccount();
    const range = Number(new URL(request.url).searchParams.get('range') ?? 30);
    if (!VALID_RANGES.has(range)) {
      return NextResponse.json(
        { error: 'Invalid dashboard range' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await queryConversationsSeries(db, accountId, range)
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
