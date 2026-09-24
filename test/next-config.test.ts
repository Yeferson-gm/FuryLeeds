import { describe, expect, test } from 'bun:test';
import nextConfig from '../next.config';

describe('Next response headers', () => {
  test('allows Cloudflare to inject browser analytics into HTML', async () => {
    if (!nextConfig.headers) throw new Error('Next headers are not configured');

    const rules = await nextConfig.headers();
    const htmlRule = rules.find((rule) =>
      rule.source.startsWith('/:path((?!_next/static')
    );
    const cacheControl = htmlRule?.headers.find(
      (header) => header.key === 'Cache-Control'
    )?.value;

    expect(cacheControl?.split(',').map((value) => value.trim())).not.toContain(
      'no-transform'
    );
  });

  test('allows the Cloudflare browser beacon through CSP', async () => {
    if (!nextConfig.headers) throw new Error('Next headers are not configured');

    const rules = await nextConfig.headers();
    const securityRule = rules.find((rule) => rule.source === '/:path*');
    const policy = securityRule?.headers.find(
      (header) => header.key === 'Content-Security-Policy-Report-Only'
    )?.value;

    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com"
    );
    expect(policy).toContain(
      "script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com"
    );
    expect(policy).toContain(
      "connect-src 'self' ws: wss: https://cloudflareinsights.com"
    );
  });
});
