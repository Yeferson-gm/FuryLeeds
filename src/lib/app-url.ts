const DEVELOPMENT_URL = 'http://localhost:3000';

/**
 * Canonical origin for this CRM installation.
 *
 * Better Auth, OAuth callbacks, invitation links and Socket.IO must agree on
 * one origin. Production therefore requires `BETTER_AUTH_URL`; development and
 * tests default to localhost for zero-config local startup.
 */
export interface ApplicationUrlEnvironment {
  BETTER_AUTH_URL?: string;
  NODE_ENV?: string;
}

export function applicationUrl(
  environment: ApplicationUrlEnvironment = process.env
): string {
  const configured = environment.BETTER_AUTH_URL?.trim();
  if (!configured) {
    if (environment.NODE_ENV === 'production') {
      throw new Error('BETTER_AUTH_URL is required in production.');
    }
    return DEVELOPMENT_URL;
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('BETTER_AUTH_URL must be a valid absolute URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('BETTER_AUTH_URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('BETTER_AUTH_URL must not contain credentials.');
  }
  return url.origin;
}
