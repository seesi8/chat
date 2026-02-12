# Playwright DM + Accounts Tests

This Playwright suite is self-contained under `test/playwright` and targets account + direct messaging flows only.

## Run

```bash
npx playwright test -c test/playwright/playwright.config.ts
```

Headed mode:

```bash
npx playwright test -c test/playwright/playwright.config.ts --headed
```

## Required Environment Variables

- `E2E_USER_B_EMAIL`
- `E2E_USER_B_PASSWORD`
- `E2E_USER_B_USERNAME`

Optional:

- `E2E_DM_NAME` (default: generated per test)
- `E2E_CREATE_NEW_USER_A` (default: `1`; when `1`, setup creates a new User A each run)
- `E2E_USER_A_EMAIL` and `E2E_USER_A_PASSWORD` (used only when `E2E_CREATE_NEW_USER_A=0`)
- `E2E_USER_A_EMAIL_PREFIX` (default: `e2e-user-a`, used for generated User A)
- `E2E_USER_EMAIL_DOMAIN` (default: `example.com`, used for generated User A)
- `E2E_BACKUP_PASSPHRASE` (default fallback: `hi`)
- `E2E_USER_A_PASSPHRASE`
- `E2E_USER_B_PASSPHRASE`
- `PLAYWRIGHT_BASE_URL` (default: `http://127.0.0.1:3000`)
- `PLAYWRIGHT_SKIP_WEBSERVER=1` (if app already running)
- `PLAYWRIGHT_WEB_SERVER_CMD` (default: `npm run dev`)

## Included Specs

- `auth-login.setup.ts`: creates a fresh User A account by default each run, then stores `test/playwright/.auth/userA.json` and `test/playwright/.auth/runtime-users.json`.
- `friends.spec.ts`: initiates friend flow from account UI.
- `direct-message.spec.ts`: creates/opens DM and sends a message.
- `dm-simultaneous.spec.ts`: cross-send between two users at near same time.
- `dm-out-of-order.spec.ts`: delayed delivery robustness by temporarily taking user B offline, then validating eventual decrypt/visibility.
