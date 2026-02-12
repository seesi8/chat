import { expect, test } from '@playwright/test';

import {
  ensureDmExists,
  ensureHomeLoaded,
  loginIfNeeded,
  missingEnv,
  openThread,
  restoreLostKeyIfVisible,
  sendDmMessage,
} from './helpers';

test('simultaneous_cross_send between two dm participants succeeds', async ({
  page,
  browser,
  baseURL,
}) => {
  const missing = missingEnv([
    'E2E_USER_B_USERNAME',
    'E2E_USER_B_EMAIL',
    'E2E_USER_B_PASSWORD',
  ]);
  test.skip(missing.length > 0, `Missing env vars: ${missing.join(', ')}`);

  const friendUsername = process.env.E2E_USER_B_USERNAME as string;
  const dmName = process.env.E2E_DM_NAME || `simul-${Date.now()}`;

  const aPassphrase =
    process.env.E2E_USER_A_PASSPHRASE || process.env.E2E_BACKUP_PASSPHRASE || 'hi';
  const bEmail = process.env.E2E_USER_B_EMAIL as string;
  const bPassword = process.env.E2E_USER_B_PASSWORD as string;
  const bPassphrase = process.env.E2E_USER_B_PASSPHRASE || aPassphrase;

  await page.goto('/');
  await restoreLostKeyIfVisible(page, aPassphrase);
  await ensureHomeLoaded(page);

  await ensureDmExists(page, friendUsername, dmName);
  await openThread(page, dmName);

  const contextB = await browser.newContext({
    baseURL: baseURL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
  });
  const pageB = await contextB.newPage();

  try {
    await loginIfNeeded(pageB, bEmail, bPassword);
    await restoreLostKeyIfVisible(pageB, bPassphrase);
    await ensureHomeLoaded(pageB);
    await openThread(pageB, dmName);

    const messageA = `A-${Date.now()}`;
    const messageB = `B-${Date.now()}`;

    await Promise.all([sendDmMessage(page, messageA), sendDmMessage(pageB, messageB)]);

    await expect(page.getByText(messageA).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(messageB).first()).toBeVisible({ timeout: 30000 });

    await expect(pageB.getByText(messageA).first()).toBeVisible({ timeout: 30000 });
    await expect(pageB.getByText(messageB).first()).toBeVisible({ timeout: 30000 });
  } finally {
    await contextB.close();
  }
});
