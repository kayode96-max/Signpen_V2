# RLS v2 deploy runbook (rewritten PR #15)

Builds on the production security hotfix (PR #24,
`20261024050000_security_hotfix.sql`). Every file ALTERs the five live tables
(students, signatures, signed_ips, thank_you_cards, feedback); nothing is
recreated. Each file is one transaction and idempotent.

| Order | File | Purpose | Safe with the hotfix app still live? |
|---|---|---|---|
| 0 | `20261024050000_security_hotfix.sql` | PR #24 (already required) | yes |
| 1 | `20261025010000_rls_v2_schema.sql` | New columns, backfills, CHECKs, signed_ips surrogate key, new service-only tables | yes |
| 2 | `20261025020000_rls_v2_functions.sql` | All RPCs, feedback_public + first_name | yes |
| — | Deploy the app from this PR | Writes move to /api/* + service-role RPCs | — |
| 3 | `20261025030000_rls_v2_lockdown.sql` | Remove browser writes, owner/real-user policies, FORCE RLS, purge job | **no**: hotfix app can no longer sign or post feedback |

Before the app deploy, set in Vercel (each environment's own values):
`SUPABASE_SERVICE_ROLE_KEY` (already required by #24), `TURNSTILE_SECRET_KEY`,
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `GOOGLE_API_KEY`. No IP salt variable:
IPs are hashed in Postgres with the hotfix salt (`private.hash_ip`).

Retention: step 3 schedules `purge-signed-ip-hashes` (03:15 UTC daily) only if
pg_cron is installed. Production has no pg_cron: enable it under Database >
Extensions, then re-run step 3 (or just its last DO block).

Rollback of step 3 only: `supabase/rollback/20261025030000_rls_v2_lockdown_rollback.sql`
(restores the post-hotfix grants/policies; steps 1-2 are additive and stay).
