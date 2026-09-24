import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isAccountRole } from '@/lib/auth/roles';
import { sqlClient } from '@/lib/db';

const MAX_ACCOUNT_NAME_LENGTH = 80;
const MAX_PROFILE_NAME_LENGTH = 120;
const MAX_AVATAR_LENGTH = 3_000_000;

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

interface AccountRow {
  profile_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  account_id: string;
  account_role: string;
  account_name: string;
  default_currency: string;
  system_role: string;
}

async function getSession(request: Request): Promise<Session | null> {
  return auth.api.getSession({ headers: request.headers });
}

async function loadAccount(userId: string): Promise<AccountRow | null> {
  const rows = await sqlClient<AccountRow[]>`
    SELECT
      p.id AS profile_id,
      p.full_name,
      p.email,
      p.avatar_url,
      p.account_id,
      p.account_role::text AS account_role,
      a.name AS account_name,
      a.default_currency,
      u.system_role
    FROM profiles p
    INNER JOIN accounts a ON a.id = p.account_id
    INNER JOIN "user" u ON u.id = p.user_id
    WHERE p.user_id = ${userId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function accountResponse(row: AccountRow) {
  const accountRole = isAccountRole(row.account_role) ? row.account_role : null;
  const systemRole = row.system_role || 'user';

  return NextResponse.json({
    profile: {
      id: row.profile_id,
      full_name: row.full_name,
      email: row.email,
      avatar_url: row.avatar_url,
      account_id: row.account_id,
      account_role: accountRole,
    },
    account: {
      id: row.account_id,
      name: row.account_name,
      default_currency: row.default_currency,
    },
    role: accountRole,
    systemRole,
    isSuperadmin: systemRole === 'superadmin',
  });
}

function errorResponse(error: unknown) {
  console.error('[api/account]', error);
  return NextResponse.json(
    { error: 'No se pudo procesar la cuenta.' },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const row = await loadAccount(session.user.id);
    if (!row) {
      return NextResponse.json(
        { error: 'El perfil no está vinculado a una cuenta.' },
        { status: 403 }
      );
    }

    return accountResponse(row);
  } catch (error) {
    return errorResponse(error);
  }
}

interface PatchBody {
  name?: unknown;
  profile?: {
    fullName?: unknown;
    avatarUrl?: unknown;
  };
}

function validAvatar(value: string): boolean {
  return (
    value.startsWith('https://') ||
    value.startsWith('http://localhost') ||
    /^data:image\/(png|jpeg|webp|gif);base64,/.test(value)
  );
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const current = await loadAccount(session.user.id);
    if (!current) {
      return NextResponse.json(
        { error: 'El perfil no está vinculado a una cuenta.' },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body || (body.name === undefined && body.profile === undefined)) {
      return NextResponse.json(
        { error: 'No hay cambios válidos.' },
        { status: 400 }
      );
    }

    let accountName: string | undefined;
    if (body.name !== undefined) {
      if (
        current.account_role !== 'owner' &&
        current.account_role !== 'admin'
      ) {
        return NextResponse.json(
          { error: 'Se requiere rol de administrador.' },
          { status: 403 }
        );
      }
      if (typeof body.name !== 'string') {
        return NextResponse.json(
          { error: 'El nombre de la cuenta debe ser texto.' },
          { status: 400 }
        );
      }
      accountName = body.name.trim();
      if (!accountName || accountName.length > MAX_ACCOUNT_NAME_LENGTH) {
        return NextResponse.json(
          {
            error: `El nombre de la cuenta debe tener entre 1 y ${MAX_ACCOUNT_NAME_LENGTH} caracteres.`,
          },
          { status: 400 }
        );
      }
    }

    let fullName: string | undefined;
    let avatarUrl: string | null | undefined;
    if (body.profile !== undefined) {
      if (!body.profile || typeof body.profile !== 'object') {
        return NextResponse.json(
          { error: 'El perfil no es válido.' },
          { status: 400 }
        );
      }
      if (body.profile.fullName !== undefined) {
        if (typeof body.profile.fullName !== 'string') {
          return NextResponse.json(
            { error: 'El nombre debe ser texto.' },
            { status: 400 }
          );
        }
        fullName = body.profile.fullName.trim();
        if (!fullName || fullName.length > MAX_PROFILE_NAME_LENGTH) {
          return NextResponse.json(
            {
              error: `El nombre debe tener entre 1 y ${MAX_PROFILE_NAME_LENGTH} caracteres.`,
            },
            { status: 400 }
          );
        }
      }
      if (body.profile.avatarUrl !== undefined) {
        if (body.profile.avatarUrl === null) {
          avatarUrl = null;
        } else if (
          typeof body.profile.avatarUrl !== 'string' ||
          body.profile.avatarUrl.length > MAX_AVATAR_LENGTH ||
          !validAvatar(body.profile.avatarUrl)
        ) {
          return NextResponse.json(
            { error: 'La imagen de perfil no es válida.' },
            { status: 400 }
          );
        } else {
          avatarUrl = body.profile.avatarUrl;
        }
      }
    }

    await sqlClient.begin(async (transaction) => {
      if (accountName !== undefined) {
        await transaction`
          UPDATE accounts
          SET name = ${accountName}, updated_at = NOW()
          WHERE id = ${current.account_id}
        `;
      }
      if (fullName !== undefined || avatarUrl !== undefined) {
        const nextName = fullName ?? current.full_name;
        const nextAvatar =
          avatarUrl === undefined ? current.avatar_url : avatarUrl;
        await transaction`
          UPDATE "user"
          SET name = ${nextName}, image = ${nextAvatar}, updated_at = NOW()
          WHERE id = ${session.user.id}
        `;
        await transaction`
          UPDATE profiles
          SET full_name = ${nextName}, avatar_url = ${nextAvatar}, updated_at = NOW()
          WHERE user_id = ${session.user.id}
        `;
      }
    });

    const updated = await loadAccount(session.user.id);
    if (!updated)
      throw new Error('La cuenta desapareció después de actualizarla.');
    return accountResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
