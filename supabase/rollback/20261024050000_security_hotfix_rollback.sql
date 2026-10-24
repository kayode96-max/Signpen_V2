-- ROLLBACK for supabase/migrations/20261024050000_security_hotfix.sql
-- Emergency use only. Restores the pre-hotfix table grants, RLS policies, storage
-- policies, bucket limits and realtime publication from prod_schema.sql.
-- This RE-OPENS the email exposure on students and feedback and the public storage
-- writes. Run it only to unblock a broken release, then re-apply the hotfix.
--
-- What it deliberately does NOT do:
--   * It NEVER un-hashes IPs and never restores the plaintext "ipAddress" column.
--     signed_ips stays hashed ("ipHash"), with no grants and no policies for
--     anon/authenticated (server-only). Plaintext IPs are gone and must stay gone.
--   * It keeps private.hash_ip, private.app_config (salt), has_signed_ip,
--     record_signed_ip (service_role only), get_student_public and the
--     feedback_public view. Dropping them is NOT safe: the current app (this PR)
--     calls them, and signed_ips cannot be used without them.
--   * It does not restore TRUNCATE, TRIGGER or REFERENCES; no app code needs them.
--
-- Consequence: the pre-hotfix app (main before this PR) still cannot sign after a
-- rollback (it reads/writes signed_ips.ipAddress directly and gets 500). Keep the
-- app from this PR deployed; this script only loosens the database again.
-- Idempotent. Runs in one transaction.

begin;

-- 1. Table grants (pre-hotfix: anon + authenticated had ALL on all 5 tables).
--    signed_ips is intentionally excluded.
grant select, insert, update, delete on public.students        to anon, authenticated;
grant select, insert, update, delete on public.signatures      to anon, authenticated;
grant select, insert, update, delete on public.thank_you_cards to anon, authenticated;
grant select, insert, update, delete on public.feedback        to anon, authenticated;

-- 2. students: public read policy back (owner write policy was never removed).
drop policy if exists "Allow public read access for students" on public.students;
create policy "Allow public read access for students" on public.students
  for select using (true);

-- 3. feedback: original public read policy back.
drop policy if exists feedback_public_read on public.feedback;
drop policy if exists "Allow public read access" on public.feedback;
create policy "Allow public read access" on public.feedback
  for select using (true);

-- 4. signed_ips: nothing restored (stays hashed and server-only).

-- 5. Storage bucket 'signpen': original write policies and no limits.
drop policy if exists signpen_owner_insert on storage.objects;
drop policy if exists signpen_owner_update on storage.objects;
drop policy if exists signpen_owner_delete on storage.objects;
drop policy if exists "Public Insert Access" on storage.objects;
drop policy if exists "Allow user uploads yjb2v0_0" on storage.objects;
drop policy if exists "Public Update Access" on storage.objects;
create policy "Public Insert Access" on storage.objects
  for insert with check (bucket_id = 'signpen');
create policy "Allow user uploads yjb2v0_0" on storage.objects
  for insert with check (bucket_id = 'signpen');
create policy "Public Update Access" on storage.objects
  for update using (bucket_id = 'signpen') with check (bucket_id = 'signpen');

update storage.buckets
set file_size_limit = null,
    allowed_mime_types = null
where id = 'signpen';

-- 6. Realtime: students back in supabase_realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'students'
  ) then
    alter publication supabase_realtime add table public.students;
  end if;
end
$$;

commit;
