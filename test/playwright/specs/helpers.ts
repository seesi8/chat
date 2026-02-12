import fs from 'fs';
import path from 'path';
import { expect, Page } from '@playwright/test';

export function missingEnv(keys: string[]) {
  return keys.filter((key) => !process.env[key]);
}

const PLAYWRIGHT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_USERS_PATH = path.join(PLAYWRIGHT_ROOT, '.auth', 'runtime-users.json');

export type RuntimeUser = {
  email: string;
  password: string;
  displayName: string;
  runId: string;
};

export function readRuntimeUserA(): RuntimeUser | null {
  if (!fs.existsSync(RUNTIME_USERS_PATH)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_USERS_PATH, 'utf8'));
    return parsed?.userA ?? null;
  } catch {
    return null;
  }
}

export function writeRuntimeUserA(userA: RuntimeUser) {
  fs.mkdirSync(path.dirname(RUNTIME_USERS_PATH), { recursive: true });
  fs.writeFileSync(
    RUNTIME_USERS_PATH,
    JSON.stringify({ userA }, null, 2),
    'utf8'
  );
}

export function buildFreshUserA(): RuntimeUser {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const prefix = process.env.E2E_USER_A_EMAIL_PREFIX || 'e2e-user-a';
  const domain = process.env.E2E_USER_EMAIL_DOMAIN || 'example.com';
  const email = `${prefix}+${runId}@${domain}`;

  return {
    email,
    password: `E2E!${runId}Aa1`,
    displayName: `E2EUserA${runId.replace(/[^a-zA-Z0-9]/g, '')}`,
    runId,
  };
}

export async function createAccount(page: Page, user: RuntimeUser) {
  await page.goto('/create');

  await page.getByPlaceholder('Email').fill(user.email);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByPlaceholder('Display Name').fill(user.displayName);

  const avatarPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgY6v0YkAAAAASUVORK5CYII=';

  await page.setInputFiles('input[type="file"]', {
    name: `avatar-${user.runId}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(avatarPngBase64, 'base64'),
  });

  const submitButton = page.getByRole('button', { name: /submit/i });
  await expect(submitButton).toBeEnabled({ timeout: 20_000 });
  await submitButton.click();
}

export async function restoreLostKeyIfVisible(page: Page, passphrase?: string) {
  const field = page.locator('[data-testid="lost-key-passphrase"]');
  const isVisible = await field.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isVisible || !passphrase) return;

  await field.fill(passphrase);
  await page.locator('[data-testid="lost-key-restore"]').click();
  await page.waitForTimeout(1500);
}

export async function loginIfNeeded(page: Page, email: string, password: string) {
  await page.goto('/');

  const emailField = page.getByPlaceholder('Email');
  const needsLogin = await emailField.isVisible({ timeout: 3000 }).catch(() => false);

  if (!needsLogin) return;

  await emailField.fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /submit/i }).click();
}

export async function ensureHomeLoaded(page: Page) {
  await expect(page.getByText('Threads')).toBeVisible({ timeout: 30000 });
}

export async function ensureDmExists(page: Page, friendUsername: string, dmName: string) {
  const threadButton = page.getByRole('button', { name: new RegExp(dmName, 'i') });
  const existing = await threadButton.first().isVisible({ timeout: 2000 }).catch(() => false);

  if (existing) return;

  await page.getByLabel('Create chat').click();
  await page.getByPlaceholder('Chat Name').fill(dmName);
  await page.getByPlaceholder('Member Username').fill(friendUsername);

  const addMemberButton = page.getByRole('button', { name: /add member/i }).first();
  await expect(addMemberButton).toBeVisible({ timeout: 10000 });
  await addMemberButton.click();

  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(threadButton.first()).toBeVisible({ timeout: 15000 });
}

export async function openThread(page: Page, dmName: string) {
  await page.getByRole('button', { name: new RegExp(dmName, 'i') }).first().click();
}

export async function sendDmMessage(page: Page, text: string) {
  const input = page.locator('form input:not([type="file"])').last();
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill(text);
  await page.getByRole('button', { name: /send/i }).click();
}
