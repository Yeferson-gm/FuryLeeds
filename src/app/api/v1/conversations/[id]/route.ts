import { getConversationById } from '@/lib/api/v1/conversations';
import { fail, ok, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'conversations:read');
    const { id } = await params;
    const conversation = await getConversationById(ctx.db, ctx.accountId, id);
    if (!conversation) {
      return fail('not_found', 'No se encontró la conversación', 404);
    }
    return ok(conversation);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
