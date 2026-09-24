import { NextResponse } from 'next/server';
import { queryResponseTime } from '@/app/api/dashboard/_queries';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const { db, accountId } = await getCurrentAccount();
    return NextResponse.json(await queryResponseTime(db, accountId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
