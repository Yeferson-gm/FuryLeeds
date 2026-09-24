import { describe, expect, it } from 'bun:test';
import { type ApplicationUrlEnvironment, applicationUrl } from '@/lib/app-url';

function environment(
  values: ApplicationUrlEnvironment = {}
): ApplicationUrlEnvironment {
  return values;
}

describe('applicationUrl', () => {
  it('uses localhost only outside production when no URL is configured', () => {
    expect(applicationUrl(environment({ NODE_ENV: 'test' }))).toBe(
      'http://localhost:3000'
    );
  });

  it('requires BETTER_AUTH_URL in production', () => {
    expect(() =>
      applicationUrl(environment({ NODE_ENV: 'production' }))
    ).toThrow('BETTER_AUTH_URL is required in production.');
  });

  it('normalizes the configured URL to one canonical origin', () => {
    expect(
      applicationUrl(
        environment({
          NODE_ENV: 'production',
          BETTER_AUTH_URL: 'https://crm.example.com/some/path?ignored=true',
        })
      )
    ).toBe('https://crm.example.com');
  });

  it('rejects malformed URLs, unsafe protocols and embedded credentials', () => {
    expect(() =>
      applicationUrl(environment({ BETTER_AUTH_URL: 'not-a-url' }))
    ).toThrow('valid absolute URL');
    expect(() =>
      applicationUrl(environment({ BETTER_AUTH_URL: 'ftp://crm.example.com' }))
    ).toThrow('HTTP or HTTPS');
    expect(() =>
      applicationUrl(
        environment({ BETTER_AUTH_URL: 'https://user:pass@crm.example.com' })
      )
    ).toThrow('must not contain credentials');
  });
});
