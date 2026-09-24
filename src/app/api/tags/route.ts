import { asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

const COLOR_RE = /^#[0-9a-f]{6}$/i;

const tagColumns = {
  id: schema.tags.id,
  user_id: schema.tags.userId,
  name: schema.tags.name,
  color: schema.tags.color,
  created_at: schema.tags.createdAt,
};

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const tags = await ctx.db
      .select(tagColumns)
      .from(schema.tags)
      .where(eq(schema.tags.accountId, ctx.accountId))
      .orderBy(asc(schema.tags.createdAt));

    return NextResponse.json({ tags });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      color?: unknown;
    } | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const color = typeof body?.color === 'string' ? body.color.trim() : '';

    if (!name || name.length > 40) {
      return NextResponse.json(
        { error: 'El nombre debe tener entre 1 y 40 caracteres.' },
        { status: 400 }
      );
    }
    if (!COLOR_RE.test(color)) {
      return NextResponse.json(
        { error: 'El color debe usar el formato hexadecimal #RRGGBB.' },
        { status: 400 }
      );
    }

    const [tag] = await ctx.db
      .insert(schema.tags)
      .values({
        accountId: ctx.accountId,
        userId: ctx.userId,
        name,
        color,
      })
      .returning(tagColumns);

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
