import { and, eq } from 'drizzle-orm';
import { fail, ok, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';
import { schema } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'broadcasts:send');
    const { id } = await params;
    const [row] = await ctx.db
      .select({
        id: schema.broadcasts.id,
        name: schema.broadcasts.name,
        template_name: schema.broadcasts.templateName,
        template_language: schema.broadcasts.templateLanguage,
        status: schema.broadcasts.status,
        total_recipients: schema.broadcasts.totalRecipients,
        sent_count: schema.broadcasts.sentCount,
        delivered_count: schema.broadcasts.deliveredCount,
        read_count: schema.broadcasts.readCount,
        replied_count: schema.broadcasts.repliedCount,
        failed_count: schema.broadcasts.failedCount,
        created_at: schema.broadcasts.createdAt,
        updated_at: schema.broadcasts.updatedAt,
      })
      .from(schema.broadcasts)
      .where(
        and(
          eq(schema.broadcasts.id, id),
          eq(schema.broadcasts.accountId, ctx.accountId)
        )
      )
      .limit(1);
    if (!row) return fail('not_found', 'Broadcast not found', 404);
    return ok(row);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
