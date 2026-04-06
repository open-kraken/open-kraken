import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.OPEN_KRAKEN_BROWSER_BASE_URL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: process.env.OPEN_KRAKEN_BROWSER_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        cwd: '../web',
        port: 3000,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
