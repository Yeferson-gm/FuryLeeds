import { listConversations } from '@/lib/api/v1/conversations';
import { buildPage, parseListParams } from '@/lib/api/v1/pagination';
import { okList, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'conversations:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);
    const rows = await listConversations(ctx.db, ctx.accountId, {
      limit,
      cursor,
      status: url.searchParams.get('status'),
      contactId: url.searchParams.get('contact_id'),
    });
    const { items, nextCursor } = buildPage(rows, limit);
    return okList(items, nextCursor);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
