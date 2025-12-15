This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## End-to-end testing

A Playwright suite lives in `playwright/tests`. It launches the dev server, signs into the app, and spins up a direct message with one other user. Provide the credentials via environment variables and run:

```bash
E2E_USER_EMAIL=user@example.com \
E2E_USER_PASSWORD=secretpass \
E2E_FRIEND_USERNAME=friend123 \
# optional:
# E2E_BACKUP_PASSPHRASE="hi" \
# E2E_THREAD_NAME="QA run" \
npm run e2e
```

See `docs/playwright.md` for detailed setup instructions.

The suite first runs two setup projects: one signs into the existing account and stores the raw session in `playwright/.auth/login.json`, and the next loads that state to restore the encryption key and write `playwright/.auth/user.json`. It ends with a teardown project that visits `/profile` and downloads a fresh backup before the run exits. Follow the docs if you need to refresh/remove those cached sessions.
