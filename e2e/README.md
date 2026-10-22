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

You can also run it by hand: Actions → **e2e** → Run workflow, and pass the preview URL as `base_url`. The workflow checks out the branch you select, installs Chromium and WebKit, and runs `npm run test:e2e` with that `BASE_URL`.

If the preview uses Vercel deployment protection, set the Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`. The workflow passes it through, and Playwright sends `x-vercel-protection-bypass` plus `x-vercel-set-bypass-cookie: true`. The value is never printed. Leave the secret unset for a public preview.

The lint/typecheck/build workflow is separate and is not modified here.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Site under test |
| `FCP_BUDGET_MS` | `5000` | Chromium Slow 3G first contentful paint budget |
| `TRANSFER_BUDGET_BYTES` | `1048576` | Chromium Slow 3G budget for `firstViewBytes` (1 MiB) |
| `FIRST_VIEW_FILE_BUDGET_BYTES` | `307200` | Chromium Slow 3G per-file cap (300 KB) for a request that finished before first contentful paint |
| `ENFORCE_PERF_BUDGETS` | unset | Set to `1` to fail Chromium Slow 3G rows that miss a budget |
| `TEST_STUDENT_URL` | unset | Seeded preview graduate. Adds the board page to the perf baseline. The sign-flow test stays skipped when this is unset |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | unset | Vercel protection bypass. Sent as a header when set. Not logged |
| `SUPABASE_PREVIEW_URL` | unset | Preview Supabase URL. The `signatures_public` placeholders and the unknown-UUID cache 404 stay skipped when this is unset. Do not point it at production |
| `SUPABASE_ANON_KEY` | unset | Anon key for those placeholders once they are enabled. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the fallback. Not logged |
| `TEST_BOARD_ID` | unset | Board id or slug passed as `p_id`. Falls back to the path of `TEST_STUDENT_URL` |

Slow 3G uses the Chrome DevTools preset (2000 ms latency, 50 KB/s down and up) and 4x CPU throttling on Chromium (desktop and Pixel 5). Transfer there is CDP `encodedDataLength`. After `load`, Chromium waits until in-flight responses finish, including a hero video that starts late (up to 180s). Realtime sockets are ignored. iPhone 12 runs in WebKit, which cannot apply that throttle, so those rows are marked `throttling: "unthrottled"` and use resource timing.

Each row records FCP, `firstViewBytes` (bytes transferred by the time first contentful paint fires), `largestFirstViewFileBytes`, `firstViewResources` (url and bytes for requests that finished before that paint), `transferredBytes` for the full load, request count, and the 5 largest resources of the full load. On WebKit, `firstViewBytes` is the sum of resource-timing transfers that completed by first contentful paint. Chromium Slow 3G also includes bytes already received for responses still in flight at that paint. The merged file is `e2e/results/perf-baseline.json` (also a Playwright attachment, and a GitHub Actions artifact named `perf-baseline`).

Budget gates read only the Chromium `slow-3g` rows. The WebKit rows are unthrottled, so they are not compared to these budgets. The 300 KB per-file cap (`FIRST_VIEW_FILE_BUDGET_BYTES`, 307200 bytes) applies to `largestFirstViewFileBytes` only: requests that finished before first contentful paint. Later loads, including the hero video `vid1.mp4` and the 3D model `scene.bin`, stay in `transferredBytes` and do not count toward that cap. They are outside the first-view file budget. `TRANSFER_BUDGET_BYTES` is compared to `firstViewBytes`, not to the full load. Budgets are report-only until `ENFORCE_PERF_BUDGETS=1`.

## Tests

Public pages (`/`, `/contact`, `/login`) on desktop Chromium, Pixel 5, and iPhone 12: HTTP 200, no console errors, and no horizontal overflow at mobile width.

Unknown students (fixed slug, random UUID, long garbage id): server HTTP 404, not 200 and not 500. Expected to fail until the server returns 404.

Board cache, from the ruling on PR #17. Cache headers are asserted on `GET /api/boards/[id]/signatures`. An id that is neither a UUID nor a slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, 3 to 30 characters), including an 80-character id and a 2048-character id, returns 404 with a short public cache (`s-maxage` of about 60). The slug `qa-unknown-2026` returns 404 with `no-store`. An uppercase slug such as `QA-UNKNOWN-2026` is the same uncached 404 and must not send `s-maxage`. A valid but unknown UUID, including an uppercase UUID, returns 404 with `no-store` only when `SUPABASE_PREVIEW_URL` is set, because without a reachable Supabase that request is a 500. That 500 is the error case, and it must send `no-store`. It runs when `SUPABASE_PREVIEW_URL` is unset. Junk-id and slug cases run anywhere. The shirt page is checked only for HTTP 404 and for a `Cache-Control` that does not contain `s-maxage` (the page HTML is `private, no-store`). Every case is `test.fail` on main until #17 lands.

`/contact` privacy: feedback responses must not include an `email` field, and the page must not request `signed_ips`. Expected to fail when that leak is present (the email leak is on production today).

Perf baseline: `/`, `/contact`, `/login`, and the board page when `TEST_STUDENT_URL` is set, on desktop Chromium, Pixel 5, and iPhone 12. Report-only unless budgets are enforced.

Sign flow: skipped unless `TEST_STUDENT_URL` is set, and still a placeholder when it is set. It does not sign.

`signatures_public(p_id)`, and the alias `get_board_signatures(p_id)`: skipped unless `SUPABASE_PREVIEW_URL` is set, and `test.fixme` even then. Hidden rows are left out. Private rows come back with `is_private: true` and `signatoryNote: null`, and keep `signatoryName`, `signatureImageUrl`, and `position`. No row includes signer ids, device or IP fields, or the raw `private_by_signer` / `hidden_by_owner` flags. A second fixme checks the board id leak: an anon client must not list signatures across boards without the board's id or slug, including either RPC called without `p_id`.
