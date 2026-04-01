import { defineConfig } from '@playwright/test';

const CI = !!process.env.CI;

// Use separate ports for E2E to avoid conflicts with dev server (9100/5173)
const E2E_SERVER_PORT = 19200;
const E2E_CLIENT_PORT = 5174;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: CI ? 2 : 0,
  workers: 1, // serial — shared server state

  use: {
    baseURL: `http://localhost:${E2E_CLIENT_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  webServer: [
    {
      command: `AGENT_PROVIDERS=mock AGENT_TERMINAL_PORT=${E2E_SERVER_PORT} npx tsx server/src/standalone.ts`,
      port: E2E_SERVER_PORT,
      cwd: '..',
      reuseExistingServer: !CI,
      timeout: 15_000,
    },
    {
      command: `VITE_SERVER_PORT=${E2E_SERVER_PORT} npx vite --port ${E2E_CLIENT_PORT} --strictPort`,
      port: E2E_CLIENT_PORT,
      cwd: '../client',
      reuseExistingServer: !CI,
      timeout: 15_000,
    },
  ],
});
