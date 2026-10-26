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
| `TRANSFER_BUDGET_BYTES` | `1048576` | Chromium Slow 3G budget for gated `firstViewBytes` (1 MiB). A miss is a total strictly above this |
| `FIRST_VIEW_FILE_BUDGET_BYTES` | `307200` | Chromium Slow 3G per-file cap (300 KB) for one non-lazy request initiated before first contentful paint. A miss is a file strictly above this |
| `ENFORCE_PERF_BUDGETS` | unset | Set to `1` to fail Chromium Slow 3G rows that miss a budget |
| `TEST_STUDENT_URL` | unset | Seeded preview graduate. Adds the board page to the perf baseline. The sign-flow test stays skipped when this is unset |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | unset | Vercel protection bypass. Sent as a header when set. Not logged |
| `SUPABASE_PREVIEW_URL` | unset | Preview Supabase URL. The `signatures_public` placeholders and the unknown-UUID cache 404 stay skipped when this is unset. Do not point it at production |
| `SUPABASE_ANON_KEY` | unset | Anon key for those placeholders once they are enabled. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the fallback. Not logged |
| `TEST_BOARD_ID` | unset | Board id or slug passed as `p_id`. Falls back to the path of `TEST_STUDENT_URL` |

Slow 3G uses the Chrome DevTools preset (2000 ms latency, 50 KB/s down and up) and 4x CPU throttling on Chromium (desktop and Pixel 5). Transfer there is CDP `encodedDataLength`. After first contentful paint, Chromium waits until every non-lazy request that started before that paint has finished (lazy downloads do not hold this wait open, up to 180s), then counts each one's full encoded size. The full-load total still waits for the remaining responses, including a hero video that starts late. Realtime sockets are ignored for that full-load wait. iPhone 12 runs in WebKit, which cannot apply that throttle, so those rows are marked `throttling: "unthrottled"` and use resource timing.

`firstViewBytes` matches PR #25's gated set: the full transfer size of every request initiated before first contentful paint, excluding lazy assets. Lazy assets are a hero file matching `vid1*.mp4` (including hashed `vid1.*.mp4`), `scene.bin`, and any URL path containing `three`. `inclusiveFirstViewBytes` is that same initiated set including lazy assets, which is the field PR #25 names `firstViewBytes`. `lazyBytes` is report-only. `largestFirstViewFileBytes` is the largest non-lazy request in the initiated set. `firstViewResources` lists those non-lazy requests. `transferredBytes` is the full load, including assets that start after first paint. On WebKit, the same initiated-before-paint rule uses resource-timing `transferSize` (the entry's full size) because WebKit has no CDP byte stream. The merged file is `e2e/results/perf-baseline.json` (also a Playwright attachment, and a GitHub Actions artifact named `perf-baseline`). The copy checked in with `generatedAt` `2026-10-22T09:45:00.137Z` used the previous on-the-wire-by-paint reading and is not this gated total.

Budget gates read only the Chromium `slow-3g` rows. The WebKit rows are unthrottled, so they are not compared to these budgets. The 1 MB cap (`TRANSFER_BUDGET_BYTES`) and the 300 KB per-file cap (`FIRST_VIEW_FILE_BUDGET_BYTES`, 307200 bytes) both read the gated set. A total or a single non-lazy file strictly above the cap is a miss. Lazy assets stay in `inclusiveFirstViewBytes` and `transferredBytes` and cannot fail the gate. An enforced run still fails a Chromium row whose first contentful paint is at least `FCP_BUDGET_MS` (5000). PR #25 reports that time and does not gate it. Budgets are report-only until `ENFORCE_PERF_BUDGETS=1`.

## Tests

Public pages (`/`, `/contact`, `/login`) on desktop Chromium, Pixel 5, and iPhone 12: HTTP 200, no console errors, and no horizontal overflow at mobile width.

Unknown students (fixed slug, random UUID, long garbage id): server HTTP 404, not 200 and not 500. Expected to fail until the server returns 404.

Board cache, from the ruling on PR #17. Cache headers are asserted on `GET /api/boards/[id]/signatures`. An id that is neither a UUID nor a slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, 3 to 30 characters), including an 80-character id and a 2048-character id, returns 404 with a short public cache (`s-maxage` of about 60). The slug `qa-unknown-2026` returns 404 with `no-store`. An id with uppercase letters, such as `QA-UNKNOWN-2026?from=QR` or an uppercase UUID, 308-redirects to the lowercase URL on both the shirt page and `GET /api/boards/[id]/signatures` before any lookup, and the query string is kept. The API redirect sends `Cache-Control: public, max-age=60` and must not send `s-maxage`. Following it is a 404 with `no-store` and no `s-maxage`. The uppercase UUID uses the same `SUPABASE_PREVIEW_URL` gate as the lowercase UUID. A valid but unknown UUID returns 404 with `no-store` only when `SUPABASE_PREVIEW_URL` is set, because without a reachable Supabase that request is a 500. That 500 is the error case, and it must send `no-store`. It runs when `SUPABASE_PREVIEW_URL` is unset. Junk-id and slug cases run anywhere. The shirt page is checked only for HTTP 404 and for a `Cache-Control` that does not contain `s-maxage` (the page HTML is `private, no-store`). Every case is `test.fail` on main until #17 lands.

`src/lib/public/board-url.test.ts` (`npm test`) checks that every board-link builder calls `boardUrl` and that a mixed-case id comes out lowercase. `boardUrl` is not on this branch, so the test stays skipped with a TODO for https://github.com/kayode96-max/Signpen_V2/pull/17.

`/contact` privacy: feedback responses must not include an `email` field, and the page must not request `signed_ips`. Expected to fail when that leak is present (the email leak is on production today).

Perf baseline: `/`, `/contact`, `/login`, and the board page when `TEST_STUDENT_URL` is set, on desktop Chromium, Pixel 5, and iPhone 12. Report-only unless budgets are enforced.

Sign flow: skipped unless `TEST_STUDENT_URL` is set, and still a placeholder when it is set. It does not sign.

`signatures_public(p_id)`, and the alias `get_board_signatures(p_id)`: skipped unless `SUPABASE_PREVIEW_URL` is set, and `test.fixme` even then. Hidden rows are left out. Private rows come back with `is_private: true` and `signatoryNote: null`, and keep `signatoryName`, `signatureImageUrl`, and `position`. No row includes signer ids, device or IP fields, or the raw `private_by_signer` / `hidden_by_owner` flags. A second fixme checks the board id leak: an anon client must not list signatures across boards without the board's id or slug, including either RPC called without `p_id`.
