# Signpen end-to-end smoke

Read-only Playwright suite. It loads pages and inspects responses. It does not fill forms or submit them. Mutating calls to Supabase REST, `/api/signatures`, and anonymous signup are aborted.

`BASE_URL` defaults to `http://localhost:3000`.

## Install browsers

```bash
npx playwright install --with-deps chromium webkit
```

Pixel 5 and desktop use Chromium. iPhone 12 uses WebKit.

## Local

```bash
npm run build
npm start
npm run test:e2e
```

`npm run test:e2e` is `playwright test`. A local build without a reachable Supabase project uses `placeholder.supabase.co`. DNS failures to that host are ignored so the smoke can run without credentials. HTTP errors from a real project still fail the run.

## Vercel preview

```bash
BASE_URL="https://<preview>.vercel.app" npm run test:e2e
```

After `.github/workflows/e2e.yml` is on the default branch, GitHub Actions runs this suite on a successful Vercel **Preview** `deployment_status`. Production deployments are not targeted.

You can also run it by hand: Actions → **e2e** → Run workflow, and pass the preview URL as `base_url`. The workflow checks out the branch you select, installs Chromium and WebKit, and runs `npm run test:e2e` with that `BASE_URL`. It does not use repository secrets.

The lint/typecheck/build workflow is separate and is not modified here.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Site under test |
| `FCP_BUDGET_MS` | `5000` | Slow 3G first contentful paint budget |
| `TRANSFER_BUDGET_BYTES` | `1048576` | Slow 3G first-view transfer budget (1 MiB) |
| `ENFORCE_PERF_BUDGETS` | unset | Set to `1` to fail when a budget is missed |
| `TEST_STUDENT_URL` | unset | Seeded preview graduate. The sign-flow test stays skipped when this is unset |

Slow 3G uses the Chrome DevTools preset (2000 ms latency, 50 KB/s down and up) and 4x CPU throttling on Chromium. Transfer is CDP `encodedDataLength` (bytes on the wire, including cross-origin). The run prints FCP and bytes. Budgets are annotations until `ENFORCE_PERF_BUDGETS=1`.

## Tests

Public pages (`/`, `/contact`, `/login`) on desktop Chromium, Pixel 5, and iPhone 12: HTTP 200, no console errors, and no horizontal overflow at mobile width.

Unknown students (fixed slug, random UUID, long garbage id): server HTTP 404, not 200 and not 500. Expected to fail until the server returns 404.

`/contact` privacy: feedback responses must not include an `email` field, and the page must not request `signed_ips`. Expected to fail when that leak is present (the email leak is on production today).

Landing page Slow 3G: records FCP and transferred bytes. Does not fail on budget misses unless enforced.

Sign flow: skipped unless `TEST_STUDENT_URL` is set, and still a placeholder when it is set. It does not sign.
