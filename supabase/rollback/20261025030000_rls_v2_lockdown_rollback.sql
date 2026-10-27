-- Rollback for 20261025030000_rls_v2_lockdown.sql ONLY.
-- Restores the post-hotfix (PR #24) grants and policies so the hotfix app build
-- can write again (browser inserts into signatures and feedback, owner
-- update/delete on signatures). has_signed_ip stays service_role only: the
-- hotfix app calls it with the service role key, not the anon key.
-- Steps 1 and 2 (schema + functions) are additive and stay in place; the
-- v2 app keeps working after this rollback too, just without the lockdown.
-- Never restores plaintext IPs, public student reads or email reads.

begin;

alter table public.students        no force row level security;
alter table public.signatures      no force row level security;
alter table public.signed_ips      no force row level security;
alter table public.thank_you_cards no force row level security;
alter table public.feedback        no force row level security;

-- students
drop policy if exists students_owner_select on public.students;
drop policy if exists students_owner_insert on public.students;
drop policy if exists students_owner_update on public.students;
drop policy if exists students_owner_delete on public.students;
drop policy if exists "Allow owner write access for students" on public.students;
create policy "Allow owner write access for students" on public.students
  for all using (auth.uid() = id);

-- signatures
drop trigger if exists signatures_guard on public.signatures;
drop function if exists public.tg_signatures_guard();
drop policy if exists signatures_select on public.signatures;
drop policy if exists "Allow public read access for signatures" on public.signatures;
drop policy if exists "Allow public insert access for signatures" on public.signatures;
drop policy if exists "Allow owner update/delete access for signatures" on public.signatures;
create policy "Allow public read access for signatures" on public.signatures
  for select using (true);
create policy "Allow public insert access for signatures" on public.signatures
  for insert with check (true);
create policy "Allow owner update/delete access for signatures" on public.signatures
  for all using (auth.uid() = "studentId");
grant select on public.signatures to anon, authenticated;
grant insert, update, delete on public.signatures to authenticated;

-- signed_ips: has_signed_ip stays service_role only. Do not grant it to anon
-- or authenticated; the hotfix app calls it through the service role key.
revoke all on function public.has_signed_ip(uuid, text) from public, anon, authenticated;
grant execute on function public.has_signed_ip(uuid, text) to service_role;

-- thank_you_cards
drop policy if exists thank_you_cards_owner_all on public.thank_you_cards;
drop policy if exists "Allow owner access for thank_you_cards" on public.thank_you_cards;
create policy "Allow owner access for thank_you_cards" on public.thank_you_cards
  for all using (auth.uid() = "studentId");

-- feedback
drop policy if exists "Allow public insert access" on public.feedback;
create policy "Allow public insert access" on public.feedback
  for insert with check (true);
grant insert on public.feedback to anon, authenticated;

-- retention job (harmless to keep; remove to match the hotfix exactly)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-signed-ip-hashes';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
