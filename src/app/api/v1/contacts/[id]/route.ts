import {
  ContactError,
  getContactById,
  updateContact,
} from '@/lib/api/v1/contacts';
import { fail, ok, toApiErrorResponse } from '@/lib/api/v1/respond';
import { requireApiKey } from '@/lib/auth/api-context';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'contacts:read');
    const { id } = await params;
    const contact = await getContactById(ctx.db, ctx.accountId, id);
    if (!contact) return fail('not_found', 'No se encontró el contacto', 404);
    return ok(contact);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'contacts:write');
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail(
        'bad_request',
        'El cuerpo de la solicitud debe ser un objeto JSON',
        400
      );
    }

    const updates: {
      name?: string | null;
      email?: string | null;
      company?: string | null;
    } = {};
    for (const field of ['name', 'email', 'company'] as const) {
      if (!(field in body)) continue;
      const value = body[field];
      if (value === null || typeof value === 'string') updates[field] = value;
      else {
        return fail(
          'bad_request',
          `'${field}' debe ser una cadena de texto o null`,
          400
        );
      }
    }

    const contact = await updateContact(
      ctx.db,
      ctx.accountId,
      id,
      updates,
      Array.isArray(body.tags)
        ? body.tags.filter((tag): tag is string => typeof tag === 'string')
        : null
    );
    if (!contact) return fail('not_found', 'No se encontró el contacto', 404);
    return ok(contact);
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
