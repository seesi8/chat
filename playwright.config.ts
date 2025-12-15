import { defineConfig, devices } from '@playwright/test';

const port = parseInt(process.env.PLAYWRIGHT_PORT || '3000', 10);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const loginState = process.env.PLAYWRIGHT_LOGIN_STORAGE || 'playwright/.auth/login.json';
const storageState = process.env.PLAYWRIGHT_STORAGE || 'playwright/.auth/user.json';
const slowMo = parseInt(process.env.PLAYWRIGHT_SLOWMO || '2000', 10);

export default defineConfig({
  testDir: './playwright/tests',
  timeout: 60 * 1000,
  expect: {
    timeout: 60000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      slowMo,
      args: ['--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'login-setup',
      testMatch: /auth-login\.setup\.ts/,
    },
    {
      name: 'setup',
      testMatch: /storage\.setup\.ts/,
      dependencies: ['login-setup'],
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState },
      dependencies: ['setup'],
    },
    {
      name: 'teardown',
      testMatch: /shutdown\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState },
      dependencies: ['chromium'],
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1'
      ? undefined
      : {
          command: process.env.PLAYWRIGHT_WEB_SERVER_CMD || 'npm run dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
});
