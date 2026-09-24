import {
  ContactError,
  createContactWithTags,
  listContacts,
} from '@/lib/api/v1/contacts';
import { buildPage, parseListParams } from '@/lib/api/v1/pagination';
import { fail, ok, okList, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';

function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_]/gu, '').trim();
}

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'contacts:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);
    const rows = await listContacts(ctx.db, ctx.accountId, {
      limit,
      cursor,
      search: sanitizeSearch(url.searchParams.get('search') ?? ''),
      tagId: url.searchParams.get('tag'),
    });
    const { items, nextCursor } = buildPage(rows, limit);
    return okList(items, nextCursor);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'contacts:write');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!phone) return fail('bad_request', "'phone' is required", 400);

    const { contact, created } = await createContactWithTags(
      ctx.db,
      ctx.accountId,
      {
        phone,
        name: typeof body.name === 'string' ? body.name : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        company: typeof body.company === 'string' ? body.company : undefined,
      },
      Array.isArray(body.tags)
        ? body.tags.filter((tag): tag is string => typeof tag === 'string')
        : null
    );
    return ok(contact, created ? 201 : 200);
  } catch (err) {
    if (err instanceof ContactError) {
      return fail(
        err.status === 400 ? 'bad_request' : 'internal',
        err.message,
        err.status
      );
    }
    return toApiErrorResponse(err);
  }
}
