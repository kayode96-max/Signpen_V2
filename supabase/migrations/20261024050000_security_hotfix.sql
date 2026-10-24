-- Signpen production security hotfix (2026-10-24)
-- Targets the EXISTING production schema (see prod_schema.sql). Independent of PR #15 (0001/0002).
-- Idempotent: safe to re-run. Runs in one transaction.
--
-- Fixes:
--   1. anon/authenticated held ALL (incl. TRUNCATE/TRIGGER/REFERENCES) on every table.
--   2. students: public read exposed owner emails  -> owner-only reads; public board fields via RPC.
--   3. feedback: public read exposed email          -> email column unreadable; wall reads feedback_public view.
--   4. signed_ips: public read of plaintext IPs     -> server-only via RPCs, IPs replaced by salted SHA-256.
--   5. storage bucket 'signpen': public insert/update -> owner-folder writes only, size + MIME limits.
--   6. realtime streamed students rows incl. email  -> students removed from supabase_realtime.
--
-- App prerequisite: deploy with the app from this PR, and set SUPABASE_SERVICE_ROLE_KEY
-- (server-only, production project's key) in Vercel Production first. GET and POST
-- /api/signatures call has_signed_ip and record_signed_ip with it and return 503 without it.
-- Rollback (grants/policies only, IPs stay hashed): supabase/rollback/20261024050000_security_hotfix_rollback.sql

begin;

-- ---------------------------------------------------------------------------
-- 0. Private schema for the IP-hash salt (never exposed through the API)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from public, anon, authenticated;

-- Random salt generated inside the database; it never appears in SQL text or the repo.
insert into private.app_config (key, value)
values ('ip_hash_salt', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function private.hash_ip(p_ip text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      (select value from private.app_config where key = 'ip_hash_salt') || lower(btrim(p_ip)),
      'sha256'),
    'hex');
$$;
revoke all on function private.hash_ip(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Table privileges: revoke everything, grant back only what the app uses
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- signatures: boards read them publicly; the signing route inserts with the signer's
-- (anonymous) session; owners update/delete via existing owner policy.
grant select on public.signatures to anon, authenticated;
grant insert, update, delete on public.signatures to authenticated;

-- students: signed-in users only, rows limited by RLS to the owner.
grant select, insert, update, delete on public.students to authenticated;

-- thank_you_cards: owner-only (existing policy).
grant select, insert, update, delete on public.thank_you_cards to authenticated;

-- feedback: insert, plus SELECT on non-email columns only (granted in section 3).
grant insert on public.feedback to anon, authenticated;

-- signed_ips: no grants at all (server-only through security-definer RPCs below).

-- ---------------------------------------------------------------------------
-- 2. students: owner-only reads + public board RPC
-- ---------------------------------------------------------------------------
drop policy if exists "Allow public read access for students" on public.students;
-- Kept as is: "Allow owner write access for students" FOR ALL USING (auth.uid() = id)
-- (covers the owner's own select/insert/update/delete).

-- Signature and columns match PR #15 (0002_rls.sql) and what PR #17 reads
-- (src/lib/server/public-student.ts: rpc("get_student_public", { p_id })).
-- Dropped first so a re-run can change the return columns (CREATE OR REPLACE cannot).
drop function if exists public.get_student_public(uuid);
create function public.get_student_public(p_id uuid)
returns table (
  id uuid,
  name text,
  "profilePhotoUrl" text,
  "pageSettings" jsonb,
  "popupMessageConfig" jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s."profilePhotoUrl", s."pageSettings", s."popupMessageConfig"
  from public.students s
  where s.id = p_id
    and p_id is not null;
$$;
revoke all on function public.get_student_public(uuid) from public, anon, authenticated;
grant execute on function public.get_student_public(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. feedback: email is never readable by API roles; public wall reads the
--    non-email columns (column-level grant) through an invoker view.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow public read access" on public.feedback;
drop policy if exists feedback_public_read on public.feedback;
-- Rows are public (it is a wall); the email COLUMN is protected by grants below.
create policy feedback_public_read on public.feedback
  for select to anon, authenticated using (true);
-- Kept: "Allow public insert access" FOR INSERT WITH CHECK (true)

grant select (id, name, message, rating, type, created_at) on public.feedback to anon, authenticated;

drop view if exists public.feedback_public;
create view public.feedback_public
with (security_invoker = true) as
  select f.id, f.name, f.message, f.rating, f.type, f.created_at
  from public.feedback f;
-- Supabase default privileges grant ALL on new views; keep it read-only.
revoke all on public.feedback_public from public, anon, authenticated;
grant select on public.feedback_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. signed_ips: server-only, salted hashes instead of plaintext IPs
-- ---------------------------------------------------------------------------
drop policy if exists "Allow public read access for signed_ips" on public.signed_ips;
drop policy if exists "Allow public insert/update access for signed_ips" on public.signed_ips;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'signed_ips' and column_name = 'ipAddress'
  ) then
    update public.signed_ips set "ipAddress" = private.hash_ip("ipAddress");
    alter table public.signed_ips rename column "ipAddress" to "ipHash";
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.signed_ips'::regclass and conname = 'signed_ips_iphash_sha256'
  ) then
    alter table public.signed_ips
      add constraint signed_ips_iphash_sha256 check ("ipHash" ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

-- Has this IP already signed this board? (boolean only; never returns hashes)
-- Server-only: GET /api/signatures calls it with the service role key, so the
-- browser cannot probe guessed IPs.
create or replace function public.has_signed_ip(p_student_id uuid, p_ip text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.signed_ips
    where "studentId" = p_student_id and "ipHash" = private.hash_ip(p_ip)
  );
$$;
revoke all on function public.has_signed_ip(uuid, text) from public, anon, authenticated;
grant execute on function public.has_signed_ip(uuid, text) to service_role;

-- Record a signing IP (hashed). Returns true if newly recorded.
create or replace function public.record_signed_ip(p_student_id uuid, p_ip text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_ip is null or btrim(p_ip) = '' then
    return false;
  end if;
  insert into public.signed_ips ("studentId", "ipHash")
  values (p_student_id, private.hash_ip(p_ip))
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
-- Server-only: the signing route calls it with the service role key, so signed-in
-- users cannot record made-up IPs to block other signers.
revoke all on function public.record_signed_ip(uuid, text) from public, anon, authenticated;
grant execute on function public.record_signed_ip(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Storage bucket 'signpen': owner-folder writes, limits
--    App path: <profile-photos|background-images>/<auth.uid()>/<file>
-- ---------------------------------------------------------------------------
drop policy if exists "Public Insert Access" on storage.objects;
drop policy if exists "Allow user uploads yjb2v0_0" on storage.objects;
drop policy if exists "Public Update Access" on storage.objects;
-- Public read policies ("Public Read Access", "Allow public read access yjb2v0_0") are kept:
-- boards show profile/background photos by public URL.

drop policy if exists signpen_owner_insert on storage.objects;
drop policy if exists signpen_owner_update on storage.objects;
drop policy if exists signpen_owner_delete on storage.objects;

create policy signpen_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signpen'
    and (storage.foldername(name))[1] in ('profile-photos', 'background-images')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy signpen_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'signpen'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    bucket_id = 'signpen'
    and (storage.foldername(name))[1] in ('profile-photos', 'background-images')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy signpen_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'signpen'
    and (storage.foldername(name))[1] in ('profile-photos', 'background-images')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

update storage.buckets
set file_size_limit = 5242880,  -- 5 MB: the app uploads phone photos without compressing them
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
where id = 'signpen';

-- ---------------------------------------------------------------------------
-- 6. Realtime: stop streaming students rows (they contain email)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'students'
  ) then
    alter publication supabase_realtime drop table public.students;
  end if;
end
$$;

commit;
