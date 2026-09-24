import { describe, expect, test } from 'bun:test';
import { GET, HEAD } from '@/app/health/route';

describe('/health', () => {
  test('returns a non-cacheable liveness response', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('supports a bodyless HEAD probe', async () => {
    const response = HEAD();

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.text()).toBe('');
  });
});
