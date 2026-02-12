import { expect, test } from '@playwright/test';

import {
  ensureDmExists,
  ensureHomeLoaded,
  missingEnv,
  openThread,
  restoreLostKeyIfVisible,
  sendDmMessage,
} from './helpers';

test('direct message can be created/opened and sent', async ({ page }) => {
  const missing = missingEnv(['E2E_USER_B_USERNAME']);
  test.skip(missing.length > 0, `Missing env vars: ${missing.join(', ')}`);

  const friendUsername = process.env.E2E_USER_B_USERNAME as string;
  const dmName = process.env.E2E_DM_NAME || `dm-${Date.now()}`;
  const passphrase =
    process.env.E2E_USER_A_PASSPHRASE || process.env.E2E_BACKUP_PASSPHRASE || 'hi';

  await page.goto('/');
  await restoreLostKeyIfVisible(page, passphrase);
  await ensureHomeLoaded(page);

  await ensureDmExists(page, friendUsername, dmName);
  await openThread(page, dmName);

  const message = `dm-smoke-${Date.now()}`;
  await sendDmMessage(page, message);

  await expect(page.getByText(message).first()).toBeVisible({ timeout: 30000 });
});
