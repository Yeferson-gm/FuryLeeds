import { afterEach, mock } from 'bun:test';

process.env.ENCRYPTION_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000';
process.env.META_APP_SECRET = 'test-meta-app-secret';

afterEach(() => {
  mock.clearAllMocks();
});
