import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { findContactByPhone } from '@/lib/contacts/repository';

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const phone = new URL(request.url).searchParams.get('phone')?.trim() ?? '';
    if (!phone) {
      return NextResponse.json({ error: 'phone requerido' }, { status: 400 });
    }
    const contact = await findContactByPhone(ctx.db, ctx.accountId, phone);
    return NextResponse.json({ contact });
  } catch (error) {
    return toErrorResponse(error);
  }
}
