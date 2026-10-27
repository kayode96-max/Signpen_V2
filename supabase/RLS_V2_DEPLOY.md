# RLS v2 deploy runbook (rewritten PR #15)

Builds on the production security hotfix (PR #24,
`20261024050000_security_hotfix.sql`). Every file ALTERs the five live tables
(students, signatures, signed_ips, thank_you_cards, feedback); nothing is
recreated. Each file is one transaction and idempotent.

| Order | File | Purpose | Safe with the hotfix app still live? |
|---|---|---|---|
| 0 | `20261024050000_security_hotfix.sql` | PR #24. Already applied on production. Do not re-run it. | yes |
| 1 | `20261025010000_rls_v2_schema.sql` | New columns, backfills, CHECKs, signed_ips surrogate key, new service-only tables | yes |
| 2 | `20261025020000_rls_v2_functions.sql` | All RPCs, feedback_public + first_name | yes |
| — | Deploy the app from this PR | Writes move to /api/* + service-role RPCs | — |
| 3 | `20261025030000_rls_v2_lockdown.sql` | Remove browser writes, owner/real-user policies, FORCE RLS, purge job | **no**: hotfix app can no longer sign or post feedback |

That order (schema, then functions, then deploy the app, then lockdown, then the pg_cron block) gives no downtime. The old app keeps working through schema and functions. It breaks only when lockdown runs. Open tabs still on the old build get permission denied on sign and feedback after lockdown.

## Environment

Set these in Vercel for the environment you are deploying (Preview and Production
use different values). No IP salt variable: IPs are hashed in Postgres with the
hotfix salt (`private.hash_ip`).

Required:

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY` (already required by #24). Without it the write
   routes return 503.

Optional:

4. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Captcha is on
   only when both are set and non-empty. This launch leaves both unset. The
   100 signatures per hashed IP per board per hour limit still applies. Over
   that cap the API returns 429 `{"error":"rate_limited"}` with `Retry-After`.
   Setting both keys later turns Turnstile back on with no code change (over
   the cap returns `challenge_required` again). One key alone is the same as
   neither: captcha stays off.
5. `GOOGLE_API_KEY`. Not required for go-live. `POST /api/sentiment-summary`
   returns 503 `{"error":"summary_unavailable"}` when it is unset
   (`src/app/api/sentiment-summary/route.ts`). That does not throw at build or
   at runtime, and it does not affect signing, the public board, or the rest
   of the dashboard. The dashboard button shows a retry message.
6. `GEMINI_MODEL`. Optional. Defaults to `gemini-2.5-flash` and is read only
   by the sentiment route after a key is present.

Not read by these routes: `RUST_BACKEND_URL`, `SUPABASE_PROJECT_ID`,
`SUPABASE_ANON_KEY`.

## SQL still required on production

Production already has step 0. Run the precheck first, then the remaining order.

0. `supabase/checks/rls_v2_prod_precheck_readonly.sql`. Read-only counts of
   existing rows that would violate the schema step's new CHECKs. The schema
   step aborts atomically if any of those rows exist. Do not run the schema
   step if any count is non-zero.
1. `supabase/migrations/20261025010000_rls_v2_schema.sql`
2. `supabase/migrations/20261025020000_rls_v2_functions.sql`
3. Deploy this app with the required env vars above (Turnstile and
   `GOOGLE_API_KEY` may stay unset).
4. `supabase/migrations/20261025030000_rls_v2_lockdown.sql` only after that
   app is serving traffic.
5. Retention: step 4 schedules `purge-signed-ip-hashes` (03:15 UTC daily) only
   if pg_cron is installed. Production has no pg_cron: enable it under
   Database > Extensions, then re-run step 4 (or just its last DO block).

## Rollback

Reverse order. Each file is the rollback for that step.

1. Lockdown: `supabase/rollback/20261025030000_rls_v2_lockdown_rollback.sql`.
   Restores the post-hotfix grants and policies, and drops
   `public.tg_signatures_guard()` so this file restores the pre-lockdown
   catalog on its own.
2. Functions: `supabase/rollback/20261025020000_rls_v2_functions_rollback.sql`.
   Run only after the lockdown rollback, with the hotfix app build live.
3. Schema: `supabase/rollback/20261025010000_rls_v2_schema_rollback.sql`.
   Run after the functions rollback. Destructive: it drops signer links,
   hidden/private flags, hashed-IP logs and duplicate `signed_ips` rows, and
   blanks private notes first.
