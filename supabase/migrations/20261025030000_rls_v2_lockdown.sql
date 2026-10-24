-- =============================================================================
-- Signpen RLS v2, step 3 of 3: lock down the browser write paths.
--
-- DEPLOY ORDER: run this only AFTER the app build from this PR is live in
-- that environment (it writes through /api/* + service-role RPCs). The hotfix
-- app build inserts signatures and feedback directly from the browser, and
-- both stop working once this file runs.
--
-- Requires steps 1 and 2. Replaces the policy half of PR #15's 0002_rls.sql,
-- with named drops of the production/hotfix policies (no drop-everything loop).
-- Idempotent. Rollback: supabase/rollback/20261025030000_rls_v2_lockdown_rollback.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- FORCE RLS on the original tables (postgres has BYPASSRLS, so the
-- security-definer functions still work; table owners no longer bypass silently).
-- ---------------------------------------------------------------------------
alter table public.students        force row level security;
alter table public.signatures      force row level security;
alter table public.signed_ips      force row level security;
alter table public.thank_you_cards force row level security;
alter table public.feedback        force row level security;

-- ---------------------------------------------------------------------------
-- students: owner only, and only a real (non-anonymous) account.
-- Public boards read get_student_public(p_id).
-- ---------------------------------------------------------------------------
drop policy if exists "Allow owner write access for students" on public.students;
drop policy if exists "Allow public read access for students" on public.students;
drop policy if exists students_owner_select on public.students;
drop policy if exists students_owner_insert on public.students;
drop policy if exists students_owner_update on public.students;
drop policy if exists students_owner_delete on public.students;

revoke all on table public.students from public, anon, authenticated;
grant select, insert, update, delete on table public.students to authenticated;

create policy students_owner_select on public.students
  for select to authenticated
  using (id = (select auth.uid()) and (select public.is_real_user()));
create policy students_owner_insert on public.students
  for insert to authenticated
  with check (id = (select auth.uid()) and (select public.is_real_user()));
create policy students_owner_update on public.students
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_real_user()))
  with check (id = (select auth.uid()) and (select public.is_real_user()));
create policy students_owner_delete on public.students
  for delete to authenticated
  using (id = (select auth.uid()) and (select public.is_real_user()));

-- ---------------------------------------------------------------------------
-- signatures: read-only for the browser.
--   anon/anyone: rows with both flags false (so realtime never streams private
--   or hidden rows); the board owner: every row on their board; the signer:
--   their own row unless hidden.
--   No INSERT/UPDATE/DELETE grant or policy: insert_signature,
--   owner_set_signature_hidden, signer_update_signature and delete_signature
--   (service_role) are the only writers.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow public read access for signatures" on public.signatures;
drop policy if exists "Allow public insert access for signatures" on public.signatures;
drop policy if exists "Allow owner update/delete access for signatures" on public.signatures;
drop policy if exists signatures_select on public.signatures;
-- Names used by earlier PR #15 drafts, in case a preview project ran them.
drop policy if exists signatures_owner_update on public.signatures;
drop policy if exists signatures_signer_update on public.signatures;
drop policy if exists signatures_owner_delete on public.signatures;
drop policy if exists signatures_signer_delete on public.signatures;

revoke all on table public.signatures from public, anon, authenticated;
revoke update, delete on table public.signatures from public, anon, authenticated;
grant select on table public.signatures to anon, authenticated;

create policy signatures_select on public.signatures
  for select to anon, authenticated
  using (
    (private_by_signer = false and hidden_by_owner = false)
    or ("studentId" = (select auth.uid()) and (select public.is_real_user()))
    or (hidden_by_owner = false and public.signer_owns(id))
  );

-- Backstop if an UPDATE grant is ever added back by mistake: identity columns
-- are immutable, the owner cannot touch private_by_signer, the signer cannot
-- touch hidden_by_owner. Security-definer writers (postgres) skip it; they
-- enforce the same rules themselves.
create or replace function public.tg_signatures_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new."studentId" is distinct from old."studentId"
     or new."timestamp" is distinct from old."timestamp" then
    raise exception 'signature identity columns are immutable';
  end if;

  if old."studentId" = auth.uid() and public.is_real_user() then
    if new.private_by_signer is distinct from old.private_by_signer then
      raise exception 'only the signer can change private_by_signer';
    end if;
    return new;
  end if;

  if public.signer_can_modify(old.id) then
    if new.hidden_by_owner is distinct from old.hidden_by_owner then
      raise exception 'only the board owner can change hidden_by_owner';
    end if;
    return new;
  end if;

  raise exception 'not allowed to update this signature';
end;
$$;
alter function public.tg_signatures_guard() owner to postgres;
revoke all on function public.tg_signatures_guard() from public, anon, authenticated;
grant execute on function public.tg_signatures_guard() to authenticated;

drop trigger if exists signatures_guard on public.signatures;
create trigger signatures_guard
  before update on public.signatures
  for each row execute function public.tg_signatures_guard();

-- ---------------------------------------------------------------------------
-- signed_ips: still no grants or policies. has_signed_ip was callable by
-- anon/authenticated for the hotfix app's GET /api/signatures; this app no
-- longer uses it, and an open boolean oracle on (board, IP) leaks who signed.
-- ---------------------------------------------------------------------------
revoke all on table public.signed_ips from public, anon, authenticated;
revoke all on function public.has_signed_ip(uuid, text) from public, anon, authenticated;
grant execute on function public.has_signed_ip(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- thank_you_cards: owner only; the signature must be on the owner's board.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow owner access for thank_you_cards" on public.thank_you_cards;
drop policy if exists thank_you_cards_owner_all on public.thank_you_cards;

revoke all on table public.thank_you_cards from public, anon, authenticated;
grant select, insert, update, delete on table public.thank_you_cards to authenticated;

create policy thank_you_cards_owner_all on public.thank_you_cards
  for all to authenticated
  using ("studentId" = (select auth.uid()) and (select public.is_real_user()))
  with check (
    "studentId" = (select auth.uid())
    and (select public.is_real_user())
    and exists (
      select 1 from public.signatures s
      where s.id = "signatureId" and s."studentId" = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- feedback: no browser inserts (insert_feedback via /api/feedback after
-- Turnstile + 5/IP/hour). Public wall keeps reading feedback_public; the
-- hotfix column grants (no email) and feedback_public_read policy stay.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow public insert access" on public.feedback;
revoke insert, update, delete, truncate, references, trigger on table public.feedback
  from public, anon, authenticated;
-- Column-level INSERT grants from the original "ALL" grant are dropped too.
revoke insert (id, name, email, message, rating, type, created_at) on public.feedback
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention job (30 days). Scheduled only when pg_cron is installed; the
-- extension is NOT enabled here. Production has no pg_cron today: enable it
-- in Dashboard > Database > Extensions, then re-run this block.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-signed-ip-hashes';
    perform cron.schedule('purge-signed-ip-hashes', '15 3 * * *',
      'select public.purge_old_signed_ips();');
  else
    raise notice 'pg_cron not installed: purge-signed-ip-hashes was not scheduled';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
