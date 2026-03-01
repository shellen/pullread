// ABOUTME: Vitest config using Cloudflare Workers pool for D1 integration testing.
// ABOUTME: Seeds the test database with schema.sql before each run.

import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: { DB: 'test-db' },
          bindings: {
            HMAC_SECRET: 'test-secret-key',
            ADMIN_KEY: 'test-admin-key',
          },
        },
      },
    },
  },
});
