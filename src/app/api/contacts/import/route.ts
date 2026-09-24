import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import {
  dedupeByPhone,
  isUniqueViolation,
  normalizeKey,
} from '@/lib/contacts/dedupe';
import {
  assignImportedContactTags,
  type ContactTagAssignment,
  resolveImportTagIds,
} from '@/lib/contacts/resolve-import-tags';
import { schema } from '@/lib/db';

interface ImportRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  tagNames: string[];
}

function readRows(body: unknown): ImportRow[] | null {
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { rows?: unknown }).rows)
  ) {
    return null;
  }
  const rows = (body as { rows: unknown[] }).rows;
  if (rows.length > 5000) return null;
  const parsed: ImportRow[] = [];
  for (const value of rows) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (typeof row.phone !== 'string' || !Array.isArray(row.tagNames))
      return null;
    parsed.push({
      phone: row.phone,
      name: typeof row.name === 'string' ? row.name : undefined,
      email: typeof row.email === 'string' ? row.email : undefined,
      company: typeof row.company === 'string' ? row.company : undefined,
      tagNames: row.tagNames.filter(
        (name): name is string => typeof name === 'string'
      ),
    });
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const rows = readRows(await request.json().catch(() => null));
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere entre 1 y 5000 filas válidas' },
        { status: 400 }
      );
    }

    const { unique, duplicates, invalid: invalidPhone } = dedupeByPhone(rows);
    let skipped = duplicates;
    let imported = 0;
    let failed = 0;
    const failedDetails: { phone: string; name?: string; reason: string }[] =
      [];

    const existingRows = await ctx.db
      .select({ phoneNormalized: schema.contacts.phoneNormalized })
      .from(schema.contacts)
      .where(eq(schema.contacts.accountId, ctx.accountId));
    const existing = new Set(
      existingRows
        .map((row) => row.phoneNormalized)
        .filter((phone): phone is string => !!phone)
    );
    const toInsert = unique.filter((row) => {
      if (existing.has(normalizeKey(row.phone))) {
        skipped++;
        return false;
      }
      return true;
    });

    const allTagNames = toInsert.flatMap((row) => row.tagNames);
    const { tagIdByKey, skippedNames: skippedTagNames } =
      await resolveImportTagIds(ctx.db, {
        accountId: ctx.accountId,
        userId: ctx.userId,
        tagNames: allTagNames,
        canCreateTags:
          ctx.systemRole === 'superadmin' || hasMinRole(ctx.role, 'admin'),
      });
    const assignments: ContactTagAssignment[] = [];

    for (let index = 0; index < toInsert.length; index += 50) {
      const chunk = toInsert.slice(index, index + 50);
      const values = chunk.map((row) => ({
        userId: ctx.userId,
        accountId: ctx.accountId,
        phone: row.phone,
        name: row.name?.trim() || null,
        email: row.email?.trim() || null,
        company: row.company?.trim() || null,
      }));
      try {
        const created = await ctx.db
          .insert(schema.contacts)
          .values(values)
          .returning({ id: schema.contacts.id });
        imported += created.length;
        created.forEach((contact, offset) => {
          const source = chunk[offset];
          if (source?.tagNames.length) {
            assignments.push({
              contactId: contact.id,
              tagNames: source.tagNames,
            });
          }
        });
      } catch {
        for (let offset = 0; offset < values.length; offset++) {
          const value = values[offset];
          const source = chunk[offset];
          try {
            const [created] = await ctx.db
              .insert(schema.contacts)
              .values(value)
              .returning({ id: schema.contacts.id });
            imported++;
            if (source.tagNames.length) {
              assignments.push({
                contactId: created.id,
                tagNames: source.tagNames,
              });
            }
          } catch (error) {
            if (isUniqueViolation(error)) {
              skipped++;
            } else {
              failed++;
              failedDetails.push({
                phone: source.phone,
                name: source.name,
                reason:
                  error instanceof Error ? error.message : 'Error desconocido',
              });
            }
          }
        }
      }
    }

    let tagsAssigned = 0;
    try {
      tagsAssigned = await assignImportedContactTags(
        ctx.db,
        assignments,
        tagIdByKey
      );
    } catch (error) {
      console.error('[contacts import] tag assignment failed:', error);
    }

    return NextResponse.json({
      imported,
      skipped,
      invalidPhone,
      failed,
      failedDetails,
      tagsAssigned,
      skippedTagNames,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
