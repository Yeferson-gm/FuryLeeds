import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';

const PROTECTED_PATHS = [
  '/dashboard',
  '/inbox',
  '/contacts',
  '/pipelines',
  '/broadcasts',
  '/automations',
  '/flows',
  '/agents',
  '/notifications',
  '/settings',
];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isProtectedApi =
    pathname.startsWith('/api/whatsapp/') && !pathname.includes('/webhook');

  if (!isAuthPage && !isProtectedPage(pathname) && !isProtectedApi) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (session && isAuthPage) {
    const url = request.nextUrl.clone();
    const inviteToken = request.nextUrl.searchParams.get('invite');
    url.pathname = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (!session && isProtectedPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (!session && isProtectedApi) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
