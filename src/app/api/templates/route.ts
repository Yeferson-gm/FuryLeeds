import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { toMessageTemplate } from '@/lib/whatsapp/db';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const rows = await ctx.db
      .select()
      .from(schema.messageTemplates)
      .where(eq(schema.messageTemplates.accountId, ctx.accountId))
      .orderBy(desc(schema.messageTemplates.createdAt));

    return NextResponse.json({ templates: rows.map(toMessageTemplate) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
