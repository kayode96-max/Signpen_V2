-- =============================================================================
-- Signpen: 0002_rls.sql
--
-- RELEASE GATE: apply this to a preview Supabase project first, in the same
-- release as the frontend PR that switches public pages to
-- get_student_public(p_id) and feedback_public and stops reading signed_ips.
-- Never apply it straight to production. Until that frontend ships, the
-- public board selects students (which anon can no longer read) and the
-- contact wall selects feedback (which no longer includes a select policy).
--
-- Anonymous sign-ins use role `authenticated` with
-- auth.jwt()->>'is_anonymous' = 'true'. Policies call is_real_user() so an
-- anonymous session never gets owner rights.
--
-- Owners read and edit only their own rows.
-- students is not selectable by the anon role, and anonymous sessions fail
-- is_real_user(), so they cannot read the base table. Public boards are
-- loaded only by id through get_student_public(p_id uuid), which returns
-- id, name, profilePhotoUrl, pageSettings, popupMessageConfig.
-- There is no listable students view.
--
-- Signature inserts happen only through insert_signature(), granted to
-- service_role. The Next.js route calls it with SUPABASE_SERVICE_ROLE_KEY.
--
-- Hashed IP rows: purge_old_signed_ips() deletes signature and feedback hash
-- rows older than 30 days.
-- This migration does not enable pg_cron and does not schedule the job
-- (that would touch a live project as a side effect). After enabling the
-- pg_cron extension in the Supabase dashboard (Database → Extensions), run
-- once in the SQL editor:
--
--   select cron.schedule(
--     'purge-signed-ip-hashes',
--     '15 3 * * *',
--     $$select public.purge_old_signed_ips();$$
--   );
--
-- Confirm:  select * from cron.job;
-- Remove:   select cron.unschedule('purge-signed-ip-hashes');
-- The job runs as the role that created it (use postgres). The function is
-- security definer and revoked from anon and authenticated.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_real_user()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

revoke all on function public.is_real_user() from public, anon, authenticated;
-- anon needs execute because the signatures select policy evaluates this
-- function even for a logged-out request. The function returns false then.
grant execute on function public.is_real_user() to anon, authenticated;

-- True when the current JWT is the signer who created this signature.
-- Security definer so the policy can see signature_signers without granting
-- that table to the browser. Returns a boolean, never the user id.
create or replace function public.signer_owns(p_signature_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.signature_signers ss
    where ss."signatureId" = p_signature_id
      and ss."signerUserId" = auth.uid()
  );
$$;

alter function public.signer_owns(uuid) owner to postgres;

revoke all on function public.signer_owns(uuid) from public, anon, authenticated;
grant execute on function public.signer_owns(uuid) to anon, authenticated;

-- Same session, within 24 hours of the signature timestamp.
create or replace function public.signer_can_modify(p_signature_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.signature_signers ss
    join public.signatures s on s.id = ss."signatureId"
    where ss."signatureId" = p_signature_id
      and ss."signerUserId" = auth.uid()
      and s."timestamp" > now() - interval '24 hours'
  );
$$;

alter function public.signer_can_modify(uuid) owner to postgres;

revoke all on function public.signer_can_modify(uuid) from public, anon, authenticated;
grant execute on function public.signer_can_modify(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS. FORCE so a non-superuser table owner does not silently bypass.
-- security definer functions below are owned by the migration superuser,
-- which still bypasses FORCE. Confirm on the preview project with
-- \df+ public.get_student_public
-- ASSUMPTION: this file is applied by the postgres superuser, which is how
-- Supabase hosted migrations run.
-- ---------------------------------------------------------------------------
alter table public.students               enable row level security;
alter table public.signatures             enable row level security;
alter table public.signature_signers      enable row level security;
alter table public.signed_ips             enable row level security;
alter table public.thank_you_cards        enable row level security;
alter table public.feedback               enable row level security;
alter table public.feedback_ip_hashes     enable row level security;
alter table public.sentiment_daily_usage  enable row level security;

alter table public.students               force row level security;
alter table public.signatures             force row level security;
alter table public.signature_signers      force row level security;
alter table public.signed_ips             force row level security;
alter table public.thank_you_cards        force row level security;
alter table public.feedback               force row level security;
alter table public.feedback_ip_hashes     force row level security;
alter table public.sentiment_daily_usage  force row level security;

-- ASSUMPTION: any policy created by hand in the dashboard on these tables
-- should be removed. Names from the dashboard have not been exported. This
-- loop drops them so the policies below are the whole set. If a policy must
-- be kept, export pg_policies first and replace this loop with named drops.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'students', 'signatures', 'signature_signers', 'signed_ips',
        'thank_you_cards', 'feedback', 'sentiment_daily_usage'
      )
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- students: owner only, and only a real (non-anonymous) account.
-- The anon role has no table grant. Anonymous sessions are `authenticated`
-- but fail is_real_user(), so they cannot read or write this table.
-- ---------------------------------------------------------------------------
revoke all on table public.students from public, anon, authenticated;
grant select, insert, update, delete on table public.students to authenticated;

create policy students_owner_select on public.students
  for select to authenticated
  using (id = auth.uid() and public.is_real_user());

create policy students_owner_insert on public.students
  for insert to authenticated
  with check (id = auth.uid() and public.is_real_user());

create policy students_owner_update on public.students
  for update to authenticated
  using (id = auth.uid() and public.is_real_user())
  with check (id = auth.uid() and public.is_real_user());

create policy students_owner_delete on public.students
  for delete to authenticated
  using (id = auth.uid() and public.is_real_user());

-- Public board, one id at a time. No email. No list of boards.
-- Exact return columns: id, name, profilePhotoUrl, pageSettings, popupMessageConfig.
create or replace function public.get_student_public(p_id uuid)
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
set search_path = pg_catalog, public
as $$
  select
    s.id,
    s.name,
    s."profilePhotoUrl",
    s."pageSettings",
    s."popupMessageConfig"
  from public.students s
  where s.id = p_id
    and p_id is not null;
$$;

alter function public.get_student_public(uuid) owner to postgres;

revoke all on function public.get_student_public(uuid) from public, anon, authenticated;
grant execute on function public.get_student_public(uuid) to anon, authenticated;

-- Public signatures for one board. Both privacy flags must be false.
-- Creation time is "timestamp" (the table has no createdAt column).
-- Signer ids and IP hashes are not in this result. The browser select
-- policy stays, because realtime postgres_changes needs table select.
-- That policy is a known gap: anon can read public rows across boards.
create or replace function public.get_board_signatures(p_id uuid)
returns table (
  id uuid,
  "studentId" uuid,
  "signatureImageUrl" text,
  "signatoryName" text,
  "signatoryNote" text,
  position jsonb,
  "timestamp" timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    s.id,
    s."studentId",
    s."signatureImageUrl",
    s."signatoryName",
    s."signatoryNote",
    s.position,
    s."timestamp"
  from public.signatures s
  where s."studentId" = p_id
    and p_id is not null
    and s.private_by_signer = false
    and s.hidden_by_owner = false
  order by s."timestamp" asc;
$$;

alter function public.get_board_signatures(uuid) owner to postgres;

revoke all on function public.get_board_signatures(uuid) from public, anon, authenticated;
grant execute on function public.get_board_signatures(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- signature_signers and signed_ips and sentiment usage: service role only.
-- RLS on, zero policies, grants revoked. service_role has BYPASSRLS and keeps
-- the grant it received from Supabase default privileges.
-- ---------------------------------------------------------------------------
revoke all on table public.signature_signers from public, anon, authenticated;
revoke all on table public.signed_ips from public, anon, authenticated;
revoke all on table public.feedback_ip_hashes from public, anon, authenticated;
revoke all on table public.sentiment_daily_usage from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- signatures
-- Public (and anonymous sessions) read a row only when both privacy flags
-- are false. The owner reads every signature on their board. The signer
-- reads their own row while it is not hidden by the owner, including after
-- the 24 hour edit window, so a private note does not vanish from their
-- session. ASSUMPTION: that self-read is acceptable.
-- Inserts: no policy and no grant. insert_signature() is the only writer.
-- KNOWN GAP: signatures_select lets anon select every public signature row
-- with no board filter, which exposes board ids. Realtime postgres_changes
-- needs that table select, so the policy stays. The follow-up moves live
-- updates to Realtime broadcast and revokes anon table select. Until then,
-- get_board_signatures(p_id) is the filtered read.
-- ---------------------------------------------------------------------------
revoke all on table public.signatures from public, anon, authenticated;
grant select on table public.signatures to anon, authenticated;
grant update (
  "signatoryName",
  "signatoryNote",
  "signatureImageUrl",
  position,
  private_by_signer,
  hidden_by_owner
) on table public.signatures to authenticated;
grant delete on table public.signatures to authenticated;

create policy signatures_select on public.signatures
  for select to anon, authenticated
  using (
    (private_by_signer = false and hidden_by_owner = false)
    or ("studentId" = auth.uid() and public.is_real_user())
    or (
      hidden_by_owner = false
      and public.signer_owns(id)
    )
  );

create policy signatures_owner_update on public.signatures
  for update to authenticated
  using ("studentId" = auth.uid() and public.is_real_user())
  with check ("studentId" = auth.uid() and public.is_real_user());

create policy signatures_signer_update on public.signatures
  for update to authenticated
  using (public.signer_can_modify(id))
  with check (public.signer_can_modify(id));

create policy signatures_owner_delete on public.signatures
  for delete to authenticated
  using ("studentId" = auth.uid() and public.is_real_user());

create policy signatures_signer_delete on public.signatures
  for delete to authenticated
  using (public.signer_can_modify(id));

-- The owner may set hidden_by_owner and nothing about private_by_signer.
-- Only the signer, inside signer_can_modify's 24 hour window, may change
-- private_by_signer. Signers cannot set hidden_by_owner. Identity columns
-- stay immutable. Column grants cannot tell the owner from the signer
-- (both are role authenticated), so this trigger is the enforcement.
create or replace function public.tg_signatures_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null and current_user in ('service_role', 'postgres', 'supabase_admin') then
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

revoke all on function public.tg_signatures_guard() from public, anon, authenticated;
grant execute on function public.tg_signatures_guard() to authenticated;

drop trigger if exists signatures_guard on public.signatures;
create trigger signatures_guard
  before update on public.signatures
  for each row execute function public.tg_signatures_guard();

revoke all on function public.tg_set_updated_at() from public, anon, authenticated;
grant execute on function public.tg_set_updated_at() to authenticated;

-- ---------------------------------------------------------------------------
-- thank_you_cards: owner only. The signature must belong to that owner.
-- ---------------------------------------------------------------------------
revoke all on table public.thank_you_cards from public, anon;
grant select, insert, update, delete on table public.thank_you_cards to authenticated;

create policy thank_you_cards_owner_all on public.thank_you_cards
  for all to authenticated
  using ("studentId" = auth.uid() and public.is_real_user())
  with check (
    "studentId" = auth.uid()
    and public.is_real_user()
    and exists (
      select 1
      from public.signatures s
      where s.id = "signatureId"
        and s."studentId" = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- feedback: no browser policies. Inserts are the service role via /api/feedback
-- after Turnstile. Reads of the base table are denied, so email stays server-side.
-- ---------------------------------------------------------------------------
revoke all on table public.feedback from public, anon, authenticated;

-- Exact shape: id, first_name (first word of name), message, type, rating, created_at.
-- Newest first. security_invoker is false so the view owner can read past RLS
-- and still hide email and the rest of the name. Do not add columns here.
create or replace view public.feedback_public
with (security_barrier = true, security_invoker = false) as
select
  id,
  split_part(btrim(name), ' ', 1) as first_name,
  message,
  type,
  rating,
  created_at
from public.feedback
order by created_at desc;

revoke all on table public.feedback_public from public, anon, authenticated;
grant select on table public.feedback_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- insert_signature: one transaction for the signature, the signer link, and
-- the hashed-IP log. Unique (studentId, signerUserId) makes the one-per-session
-- rule race-free. An advisory lock on the board and hash makes the hourly
-- cap race-free for that network on that board.
-- Ceiling matches src/lib/security/limits.ts:
--   100 signatures per hashed IP per board per rolling hour.
-- There is no cross-board cap. At or over 100, the function raises
-- challenge_required unless p_challenge_passed is true (the API sets that
-- only after TURNSTILE_SECRET_KEY accepts a token). The IP row is still
-- written, so later signatures in the hour still need a token.
-- Deleting a signature removes the signer link, so that session may sign
-- again. The IP row remains and still counts toward the hour.
-- ---------------------------------------------------------------------------
create or replace function public.insert_signature(
  p_student_id uuid,
  p_signer_user_id uuid,
  p_image text,
  p_name text,
  p_note text,
  p_position jsonb,
  p_private boolean,
  p_ip_hash text,
  p_challenge_passed boolean
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_id uuid;
  board_hits integer;
begin
  if p_signer_user_id is null then
    raise exception 'signer_required' using errcode = '23502';
  end if;
  if p_ip_hash is null or char_length(p_ip_hash) < 32 then
    raise exception 'ip_hash_required' using errcode = '23502';
  end if;

  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'board_not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_ip_hash, 0));

  select count(*)::integer into board_hits
  from public.signed_ips
  where "studentId" = p_student_id
    and "ipHash" = p_ip_hash
    and "signedAt" > now() - interval '1 hour';

  if board_hits >= 100 and coalesce(p_challenge_passed, false) = false then
    raise exception 'challenge_required' using errcode = 'P0004';
  end if;

  insert into public.signatures (
    "studentId",
    "signatureImageUrl",
    "signatoryName",
    "signatoryNote",
    position,
    private_by_signer,
    hidden_by_owner
  ) values (
    p_student_id,
    p_image,
    p_name,
    p_note,
    p_position,
    coalesce(p_private, false),
    false
  )
  returning id into new_id;

  insert into public.signature_signers ("signatureId", "studentId", "signerUserId")
  values (new_id, p_student_id, p_signer_user_id);

  insert into public.signed_ips ("studentId", "ipHash", "signerUserId")
  values (p_student_id, p_ip_hash, p_signer_user_id);

  return new_id;
exception
  when unique_violation then
    raise exception 'already_signed' using errcode = '23505';
end;
$$;

alter function public.insert_signature(uuid, uuid, text, text, text, jsonb, boolean, text, boolean) owner to postgres;

revoke all on function public.insert_signature(uuid, uuid, text, text, text, jsonb, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.insert_signature(uuid, uuid, text, text, text, jsonb, boolean, text, boolean)
  to service_role;

-- Boolean only. The count and the hash are arguments, not results.
-- Same window and ceiling as insert_signature. Service role only: the
-- Next.js route hashes the IP and returns { challenge_required } to the browser.
create or replace function public.signature_challenge_required(
  p_student_id uuid,
  p_ip_hash text
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*) >= 100
  from public.signed_ips
  where "studentId" = p_student_id
    and "ipHash" = p_ip_hash
    and "signedAt" > now() - interval '1 hour';
$$;

alter function public.signature_challenge_required(uuid, text) owner to postgres;

revoke all on function public.signature_challenge_required(uuid, text) from public, anon, authenticated;
grant execute on function public.signature_challenge_required(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Sentiment quota. 5 successful summaries per board per UTC day.
-- Keep the literal 5 in sync with SENTIMENT_CALLS_PER_BOARD_PER_DAY.
-- sentiment_usage_today does not increment. The API calls
-- consume_sentiment_call only after Gemini returns a summary, so a 503
-- does not consume a slot. The UPDATE WHERE calls < 5 stops two concurrent
-- successes at 5. When that WHERE matches nothing, the function returns null.
-- ---------------------------------------------------------------------------
create or replace function public.sentiment_usage_today(p_student_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select calls
    from public.sentiment_daily_usage
    where "studentId" = p_student_id
      and day = (timezone('utc', now()))::date
  ), 0);
$$;

alter function public.sentiment_usage_today(uuid) owner to postgres;

revoke all on function public.sentiment_usage_today(uuid) from public, anon, authenticated;
grant execute on function public.sentiment_usage_today(uuid) to service_role;

create or replace function public.consume_sentiment_call(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_count integer;
begin
  insert into public.sentiment_daily_usage ("studentId", day, calls)
  values (p_student_id, (timezone('utc', now()))::date, 1)
  on conflict ("studentId", day)
  do update set calls = public.sentiment_daily_usage.calls + 1
  where public.sentiment_daily_usage.calls < 5
  returning calls into new_count;

  return new_count;
exception
  when no_data_found then
    return null;
end;
$$;

alter function public.consume_sentiment_call(uuid) owner to postgres;

revoke all on function public.consume_sentiment_call(uuid) from public, anon, authenticated;
grant execute on function public.consume_sentiment_call(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Feedback insert plus the hashed-IP cap. 5 posts per hashed IP per rolling
-- hour, on top of the Turnstile check in /api/feedback. The lock serializes
-- one hash. Over the cap, nothing is inserted and retry_after is the number
-- of seconds until fewer than 5 rows remain in the window (the row at
-- offset hits-5, oldest first). Keep the literal 5 in sync with
-- FEEDBACK_PER_IP_PER_HOUR.
-- ---------------------------------------------------------------------------
create or replace function public.insert_feedback(
  p_name text,
  p_email text,
  p_message text,
  p_type text,
  p_rating smallint,
  p_ip_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  hits integer;
  retry_after integer;
  new_id uuid;
begin
  if p_ip_hash is null or char_length(p_ip_hash) < 32 then
    raise exception 'ip_hash_required' using errcode = '23502';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

  select count(*)::integer into hits
  from public.feedback_ip_hashes
  where "ipHash" = p_ip_hash
    and "createdAt" > now() - interval '1 hour';

  if hits >= 5 then
    select ceil(extract(epoch from ("createdAt" + interval '1 hour' - now())))::integer
    into retry_after
    from public.feedback_ip_hashes
    where "ipHash" = p_ip_hash
      and "createdAt" > now() - interval '1 hour'
    order by "createdAt" asc
    offset (hits - 5)
    limit 1;

    return jsonb_build_object(
      'limited', true,
      'retry_after', greatest(coalesce(retry_after, 1), 1)
    );
  end if;

  insert into public.feedback (name, email, message, type, rating)
  values (p_name, p_email, p_message, p_type, p_rating)
  returning id into new_id;

  insert into public.feedback_ip_hashes ("ipHash")
  values (p_ip_hash);

  return jsonb_build_object('limited', false, 'id', new_id);
end;
$$;

alter function public.insert_feedback(text, text, text, text, smallint, text) owner to postgres;

revoke all on function public.insert_feedback(text, text, text, text, smallint, text)
  from public, anon, authenticated;
grant execute on function public.insert_feedback(text, text, text, text, smallint, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Retention: hashed IP rows older than 30 days, for signatures and feedback.
-- Schedule with pg_cron using the statement in the header. Not scheduled here.
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_signed_ips()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  signed_deleted integer;
  feedback_deleted integer;
begin
  delete from public.signed_ips
  where "signedAt" < now() - interval '30 days';
  get diagnostics signed_deleted = row_count;

  delete from public.feedback_ip_hashes
  where "createdAt" < now() - interval '30 days';
  get diagnostics feedback_deleted = row_count;

  return signed_deleted + feedback_deleted;
end;
$$;

alter function public.purge_old_signed_ips() owner to postgres;

revoke all on function public.purge_old_signed_ips() from public, anon, authenticated;
grant execute on function public.purge_old_signed_ips() to service_role;

-- ---------------------------------------------------------------------------
-- Storage. Bucket and object keys verified in src/supabase/storage.ts:
--   bucket signpen
--   profile-photos/{auth uid}/{original filename}
--   background-images/{auth uid}/{original filename}
-- upload() is called with upsert: true, so update is required as well as insert.
-- ASSUMPTION: the bucket already exists on production and is PUBLIC, because
-- the client stores getPublicUrl(). This insert does not change an existing
-- bucket. On a fresh preview project it creates a public bucket.
-- Public buckets serve reads without a storage select policy. These policies
-- only cover writes. Anonymous sessions fail is_real_user().
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('signpen', 'signpen', true)
on conflict (id) do nothing;

drop policy if exists signpen_owner_insert on storage.objects;
drop policy if exists signpen_owner_update on storage.objects;
drop policy if exists signpen_owner_delete on storage.objects;

create policy signpen_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signpen'
    and public.is_real_user()
    and (storage.foldername(name))[1] in ('profile-photos', 'background-images')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy signpen_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'signpen'
    and public.is_real_user()
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'signpen'
    and (storage.foldername(name))[1] in ('profile-photos', 'background-images')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy signpen_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'signpen'
    and public.is_real_user()
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Optional, not applied (it changes an existing bucket and should be a
-- separate reviewed change):
-- update storage.buckets
--    set file_size_limit = 5242880,
--        allowed_mime_types = array['image/png','image/jpeg','image/webp']
--  where id = 'signpen';

notify pgrst, 'reload schema';

commit;
