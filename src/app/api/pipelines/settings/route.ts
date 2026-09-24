import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { CURRENCIES } from '@/lib/currency';
import { schema } from '@/lib/db';
import { badRequest, serverError } from '../_shared';

export async function PATCH(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireRole>>;
  try {
    ctx = await requireRole('admin');
  } catch (error) {
    return toErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as {
    default_currency?: unknown;
  } | null;
  const currency =
    typeof body?.default_currency === 'string'
      ? body.default_currency.toUpperCase()
      : '';
  if (!CURRENCIES.some((item) => item.code === currency)) {
    return badRequest('Moneda no válida.');
  }

  try {
    const updated = await ctx.db
      .update(schema.accounts)
      .set({ defaultCurrency: currency, updatedAt: new Date().toISOString() })
      .where(eq(schema.accounts.id, ctx.accountId))
      .returning({ id: schema.accounts.id });
    if (!updated[0]) {
      return NextResponse.json(
        { error: 'Cuenta no encontrada.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ default_currency: currency });
  } catch (error) {
    return serverError('settings/PATCH', error);
  }
}
