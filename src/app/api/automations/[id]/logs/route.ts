import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  findAutomation,
  listAutomationLogs,
} from '@/lib/automations/repository';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('viewer');
    const { id } = await params;
    const automation = await findAutomation(ctx.accountId, id);
    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const logs = await listAutomationLogs(ctx.accountId, id);
    return NextResponse.json({ automation, logs });
  } catch (error) {
    return toErrorResponse(error);
  }
}
