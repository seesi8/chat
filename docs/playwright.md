# Playwright end-to-end tests

The Playwright suite spins up the Next.js dev server, opens a real Chromium browser, and drives the UI to create a direct message. Because it exercises the actual Firebase runtime, you must point the app at a test-friendly backend (Firebase emulators or throwaway accounts) and provide credentials through environment variables. Firebase Auth persistence is forced to `localStorage`, so the first setup run captures the authenticated state in `playwright/.auth/user.json`.

## Prerequisites

1. Install the browser binaries once per machine:
   ```bash
   npx playwright install --with-deps
   ```
2. Start the Firebase emulators and seed two accounts that can message each other. The setup step now assumes the primary account already exists and simply signs in with the credentials you provide.
3. Export the variables used by the suite:
   - `E2E_USER_EMAIL` – email of the primary user
   - `E2E_USER_PASSWORD` – password for the primary user
   - `E2E_BACKUP_PASSPHRASE` *(optional)* – passphrase used whenever the suite restores/downloads a backup (defaults to `hi`)
   - `E2E_FRIEND_USERNAME` – username (without the leading `@`) of the friend that should be invited into the DM
   - `E2E_THREAD_NAME` *(optional)* – override for the DM name shown in the UI

## Running the tests

Playwright automatically launches `npm run dev`. If you already have the dev server running, set `PLAYWRIGHT_SKIP_WEBSERVER=1`.

```bash
E2E_USER_EMAIL=user@example.com \
E2E_USER_PASSWORD=secretpass \
E2E_FRIEND_USERNAME=friend123 \
npm run e2e
```

Useful variations:

- `npm run e2e:headed` – see the browser while the test runs
- `npm run e2e:report` – reopen the HTML report from the last run

The suite now uses two setup steps:

1. **auth-login.setup.ts** signs in once (no key restore) and saves the raw session at `playwright/.auth/login.json`.
2. **storage.setup.ts** loads that session, handles the “Lost your key?” modal, and writes the fully-restored state to `playwright/.auth/user.json`.

All other tests reuse the `user.json` state, so the DM run starts from an already logged-in session. After the DM test finishes, a teardown project visits `/profile`, downloads the latest backup, and enters the same passphrase so your app’s shutdown routine is exercised each run. If you change credentials or need to invalidate the session, delete both `playwright/.auth/login.json` and `playwright/.auth/user.json` and rerun either `npm run e2e` or just the setup projects:

```bash
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test playwright/tests/storage.setup.ts
```

If none of the required env vars are present, both the setup step and the direct-message spec are skipped so CI can still pass quickly.
