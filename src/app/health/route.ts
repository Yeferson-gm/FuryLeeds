const HEALTH_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
} as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  return Response.json(
    { status: 'ok' },
    { status: 200, headers: HEALTH_HEADERS }
  );
}

export function HEAD() {
  return new Response(null, { status: 204, headers: HEALTH_HEADERS });
}
