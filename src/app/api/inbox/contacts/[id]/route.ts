import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getContactDetail } from '@/lib/contacts/repository';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('viewer');
    const { id } = await params;
    const detail = await getContactDetail(ctx.db, ctx.accountId, id);
    if (!detail) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }
    return NextResponse.json(detail);
  } catch (error) {
    return toErrorResponse(error);
  }
}
