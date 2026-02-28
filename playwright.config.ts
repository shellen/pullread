// ABOUTME: Playwright test configuration for browser-based UI testing.
// ABOUTME: Uses a lightweight static server to serve the embedded viewer HTML.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:7799',
    headless: true,
  },
  webServer: [
    {
      command: 'bun tests/e2e/serve-viewer.ts',
      port: 7799,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun tests/e2e/fixtures/setup.ts',
      port: 7788,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: 'basic-usage.spec.ts',
    },
    {
      name: 'e2e-real',
      use: { browserName: 'chromium', baseURL: 'http://localhost:7788' },
      testMatch: 'basic-usage.spec.ts',
    },
  ],
});
