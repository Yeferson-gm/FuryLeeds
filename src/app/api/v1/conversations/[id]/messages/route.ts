import { listConversationMessages } from '@/lib/api/v1/conversations';
import { buildPage, parseListParams } from '@/lib/api/v1/pagination';
import { fail, okList, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'messages:read');
    const { id } = await params;
    const { limit, cursor } = parseListParams(request);
    const rows = await listConversationMessages(ctx.db, ctx.accountId, id, {
      limit,
      cursor,
    });
    if (!rows) return fail('not_found', 'No se encontró la conversación', 404);
    const { items, nextCursor } = buildPage(rows, limit);
    return okList(items, nextCursor);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
