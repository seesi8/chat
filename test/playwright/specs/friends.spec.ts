import { expect, test } from '@playwright/test';

import {
  ensureHomeLoaded,
  missingEnv,
  restoreLostKeyIfVisible,
} from './helpers';

test('account friend flow can be initiated from add friend UI', async ({ page }) => {
  const missing = missingEnv(['E2E_USER_B_USERNAME']);
  test.skip(missing.length > 0, `Missing env vars: ${missing.join(', ')}`);

  const friendUsername = process.env.E2E_USER_B_USERNAME as string;
  const passphrase =
    process.env.E2E_USER_A_PASSPHRASE || process.env.E2E_BACKUP_PASSPHRASE || 'hi';

  await page.goto('/');
  await restoreLostKeyIfVisible(page, passphrase);
  await ensureHomeLoaded(page);

  await page.getByLabel('Add friend').click();
  await page.getByPlaceholder('Member Username').fill(friendUsername);

  const addFriendButton = page.getByRole('button', { name: /^add friend$/i }).first();
  await expect(addFriendButton).toBeVisible({ timeout: 10000 });
  await addFriendButton.click();

  const confirmBox = page.locator('#checkbox');
  const hasConfirm = await confirmBox.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasConfirm) {
    await confirmBox.check();
    await page.getByRole('button', { name: /continue/i }).click();
  }

  const relationshipButton = page.locator(
    'button:has-text("Stop Friend Request"), button:has-text("Remove Friend"), button:has-text("Accept Friend")'
  );
  await expect(relationshipButton.first()).toBeVisible({ timeout: 15000 });
});
