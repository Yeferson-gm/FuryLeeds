import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { listTags } from '@/lib/contacts/repository';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    return NextResponse.json({ tags: await listTags(ctx.db, ctx.accountId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
