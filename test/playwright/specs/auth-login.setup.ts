import fs from 'fs';
import path from 'path';
import { test } from '@playwright/test';

import {
  buildFreshUserA,
  createAccount,
  ensureHomeLoaded,
  loginIfNeeded,
  readRuntimeUserA,
  restoreLostKeyIfVisible,
  writeRuntimeUserA,
} from './helpers';

test('auth setup stores logged-in session for user A', async ({ page, context }) => {
  const useExisting =
    process.env.E2E_CREATE_NEW_USER_A === '0' &&
    !!process.env.E2E_USER_A_EMAIL &&
    !!process.env.E2E_USER_A_PASSWORD;

  let userA = readRuntimeUserA();
  if (!userA || process.env.E2E_CREATE_NEW_USER_A !== '0') {
    userA = buildFreshUserA();
  }

  const passphrase =
    process.env.E2E_USER_A_PASSPHRASE || process.env.E2E_BACKUP_PASSPHRASE || 'hi';

  if (useExisting) {
    await loginIfNeeded(
      page,
      process.env.E2E_USER_A_EMAIL as string,
      process.env.E2E_USER_A_PASSWORD as string
    );
  } else {
    await createAccount(page, userA);
  }

  await restoreLostKeyIfVisible(page, passphrase);
  await ensureHomeLoaded(page);

  const authPath = path.join(__dirname, '..', '.auth', 'userA.json');
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  await context.storageState({ path: authPath });
  writeRuntimeUserA(userA);
});
