import path from 'path';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const authState = path.join(__dirname, '.auth', 'userA.json');

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  reporter: process.env.CI ? 'html' : 'list',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth-login\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authState,
      },
      testIgnore: /auth-login\.setup\.ts/,
      dependencies: ['setup'],
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1'
      ? undefined
      : {
          command: process.env.PLAYWRIGHT_WEB_SERVER_CMD || 'npm run dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
});
