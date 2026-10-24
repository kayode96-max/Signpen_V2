-- =============================================================================
-- Signpen RLS v2, step 2 of 3: server functions (RPCs) and the public views.
--
-- Requires: 20261024050000_security_hotfix.sql and 20261025010000_rls_v2_schema.sql.
-- Replaces the function half of PR #15's 0002_rls.sql.
--
-- Additive: creates or replaces functions only, and widens feedback_public by
-- one trailing column. No table grant or policy changes, so the hotfix app
-- build keeps working after this file. Idempotent.
--
-- Every function: SECURITY DEFINER where it reads server-only tables,
-- `set search_path = ''` (fully-qualified names only), owner postgres,
-- EXECUTE revoked from public/anon/authenticated (Supabase grants new
-- functions to all of them by default), then granted to exactly the roles
-- that need it. Write functions are service_role only: the Next.js routes call
-- them with SUPABASE_SERVICE_ROLE_KEY after verifying the caller's JWT.
--
-- IP addresses: functions take the raw IP (p_ip) and store only
-- private.hash_ip(p_ip), the salted SHA-256 from the hotfix. The salt lives in
-- private.app_config and never leaves the database.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True for a signed-in, non-anonymous JWT. Used by RLS policies (step 3).
create or replace function public.is_real_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;
alter function public.is_real_user() owner to postgres;
revoke all on function public.is_real_user() from public, anon, authenticated;
-- anon needs it because the signatures select policy evaluates it for logged-out reads.
grant execute on function public.is_real_user() to anon, authenticated;

-- True when the current JWT created this signature. Boolean only.
create or replace function public.signer_owns(p_signature_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.signature_signers ss
    where ss."signatureId" = p_signature_id
      and ss."signerUserId" = auth.uid()
  );
$$;
alter function public.signer_owns(uuid) owner to postgres;
revoke all on function public.signer_owns(uuid) from public, anon, authenticated;
grant execute on function public.signer_owns(uuid) to anon, authenticated;

-- Same signer session, within 24 hours of the signature timestamp.
-- Two-argument form: actor passed explicitly (service-role callers have no auth.uid()).
create or replace function public.signer_can_modify(p_signature_id uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor is not null and exists (
    select 1
    from public.signature_signers ss
    join public.signatures s on s.id = ss."signatureId"
    where ss."signatureId" = p_signature_id
      and ss."signerUserId" = p_actor
      and s."timestamp" > now() - interval '24 hours'
  );
$$;
alter function public.signer_can_modify(uuid, uuid) owner to postgres;
revoke all on function public.signer_can_modify(uuid, uuid) from public, anon, authenticated;
grant execute on function public.signer_can_modify(uuid, uuid) to service_role;

-- Session form: "can I (this JWT) still edit this signature?"
create or replace function public.signer_can_modify(p_signature_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.signer_can_modify(p_signature_id, auth.uid());
$$;
alter function public.signer_can_modify(uuid) owner to postgres;
revoke all on function public.signer_can_modify(uuid) from public, anon, authenticated;
grant execute on function public.signer_can_modify(uuid) to authenticated;

-- Non-anonymous auth user, read from auth.users (a service-role call cannot
-- trust auth.jwt()). Internal only: not executable through the API.
create or replace function public.is_real_actor(p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_actor
      and coalesce(u.is_anonymous, false) = false
      and coalesce(u.raw_app_meta_data ->> 'provider', '') is distinct from 'anonymous'
  );
$$;
alter function public.is_real_actor(uuid) owner to postgres;
revoke all on function public.is_real_actor(uuid) from public, anon, authenticated, service_role;

-- Has this auth user (device session) already signed this board? Used by
-- GET /api/signatures. Boolean only.
create or replace function public.signer_has_signed(p_student_id uuid, p_signer_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.signature_signers
    where "studentId" = p_student_id and "signerUserId" = p_signer_user_id
  );
$$;
alter function public.signer_has_signed(uuid, uuid) owner to postgres;
revoke all on function public.signer_has_signed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.signer_has_signed(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Hotfix IP functions, kept with the same names and arguments.
-- record_signed_ip now adds one row per call (signed_ips has a surrogate key),
-- so rows from the hotfix app still count toward the hourly cap. Returns true
-- when it is the first row for that IP on that board.
-- has_signed_ip is unchanged here; step 3 limits it to service_role.
-- ---------------------------------------------------------------------------
create or replace function public.record_signed_ip(p_student_id uuid, p_ip text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_first boolean;
begin
  if p_ip is null or btrim(p_ip) = '' then
    return false;
  end if;
  v_hash := private.hash_ip(p_ip);
  v_first := not exists (
    select 1 from public.signed_ips where "studentId" = p_student_id and "ipHash" = v_hash
  );
  insert into public.signed_ips ("studentId", "ipHash") values (p_student_id, v_hash);
  return v_first;
end;
$$;
alter function public.record_signed_ip(uuid, text) owner to postgres;
revoke all on function public.record_signed_ip(uuid, text) from public, anon, authenticated;
grant execute on function public.record_signed_ip(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Public reads
-- get_student_public(p_id uuid) is the hotfix function, unchanged.
-- ---------------------------------------------------------------------------

-- Public signatures for one board. hidden_by_owner rows are omitted.
-- private_by_signer rows are returned with a null note and is_private = true
-- so the shirt layout holds. No signer ids, IP hashes or raw flags.
create or replace function public.signatures_public(p_id uuid)
returns table (
  id uuid,
  "studentId" uuid,
  "signatoryName" text,
  "signatureImageUrl" text,
  "signatoryNote" text,
  is_private boolean,
  "position" jsonb,
  "timestamp" timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s."studentId",
    s."signatoryName",
    s."signatureImageUrl",
    case when s.private_by_signer then null else s."signatoryNote" end,
    s.private_by_signer as is_private,
    s.position,
    s."timestamp"
  from public.signatures s
  where s."studentId" = p_id
    and p_id is not null
    and s.hidden_by_owner = false
  order by s."timestamp" asc;
$$;
alter function public.signatures_public(uuid) owner to postgres;
revoke all on function public.signatures_public(uuid) from public, anon, authenticated;
grant execute on function public.signatures_public(uuid) to anon, authenticated;

-- feedback_public: the hotfix view (id, name, message, rating, type,
-- created_at, security_invoker) plus first_name at the end, which PR #17's
-- wall reads. Appending a column keeps CREATE OR REPLACE VIEW valid and the
-- hotfix app's reads unchanged.
create or replace view public.feedback_public
with (security_invoker = true) as
  select f.id, f.name, f.message, f.rating, f.type, f.created_at,
         split_part(btrim(f.name), ' ', 1) as first_name
  from public.feedback f;
revoke all on public.feedback_public from public, anon, authenticated;
grant select on public.feedback_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- insert_signature: signature + signer link + hashed IP row in one transaction.
-- One signature per device session per board (unique studentId+signerUserId).
-- 100 signatures per hashed IP per board per rolling hour; past that it raises
-- challenge_required (P0004) unless p_challenge_passed (set by the API only
-- after Turnstile accepted a token). No cross-board cap. Shared Wi-Fi is fine.
-- Keep 100 in sync with SIGNATURES_PER_IP_PER_BOARD_PER_HOUR.
-- ---------------------------------------------------------------------------
drop function if exists public.insert_signature(uuid, uuid, text, text, text, jsonb, boolean, text, boolean);
create function public.insert_signature(
  p_student_id uuid,
  p_signer_user_id uuid,
  p_image text,
  p_name text,
  p_note text,
  p_position jsonb,
  p_private boolean,
  p_ip text,
  p_challenge_passed boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  board_hits integer;
  v_hash text;
begin
  if p_signer_user_id is null then
    raise exception 'signer_required' using errcode = '23502';
  end if;
  if p_ip is null or btrim(p_ip) = '' then
    raise exception 'ip_required' using errcode = '23502';
  end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'board_not_found' using errcode = 'P0002';
  end if;

  v_hash := private.hash_ip(p_ip);
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || v_hash, 0));

  select count(*)::integer into board_hits
  from public.signed_ips
  where "studentId" = p_student_id
    and "ipHash" = v_hash
    and "signedAt" > now() - interval '1 hour';

  if board_hits >= 100 and coalesce(p_challenge_passed, false) = false then
    raise exception 'challenge_required' using errcode = 'P0004';
  end if;

  insert into public.signatures (
    "studentId", "signatureImageUrl", "signatoryName", "signatoryNote",
    position, private_by_signer, hidden_by_owner
  ) values (
    p_student_id, p_image, p_name, p_note,
    p_position, coalesce(p_private, false), false
  )
  returning id into new_id;

  insert into public.signature_signers ("signatureId", "studentId", "signerUserId")
  values (new_id, p_student_id, p_signer_user_id);

  insert into public.signed_ips ("studentId", "ipHash")
  values (p_student_id, v_hash);

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

-- Would the next signature from this IP on this board need Turnstile? Boolean only.
drop function if exists public.signature_challenge_required(uuid, text);
create function public.signature_challenge_required(p_student_id uuid, p_ip text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 100
  from public.signed_ips
  where "studentId" = p_student_id
    and "ipHash" = private.hash_ip(p_ip)
    and "signedAt" > now() - interval '1 hour';
$$;
alter function public.signature_challenge_required(uuid, text) owner to postgres;
revoke all on function public.signature_challenge_required(uuid, text) from public, anon, authenticated;
grant execute on function public.signature_challenge_required(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Signature edits and deletes (service_role only). Each re-checks the actor and
-- returns 'ok' | 'not_found' | 'forbidden'. The owner function writes only
-- hidden_by_owner, so the owner can never change private_by_signer. The signer
-- function never writes hidden_by_owner.
-- ---------------------------------------------------------------------------
create or replace function public.owner_set_signature_hidden(
  p_actor uuid,
  p_signature_id uuid,
  p_hidden boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  board_id uuid;
begin
  select "studentId" into board_id from public.signatures where id = p_signature_id;
  if not found then
    return 'not_found';
  end if;
  if p_hidden is null
     or board_id is distinct from p_actor
     or not public.is_real_actor(p_actor) then
    return 'forbidden';
  end if;
  update public.signatures set hidden_by_owner = p_hidden where id = p_signature_id;
  return 'ok';
end;
$$;
alter function public.owner_set_signature_hidden(uuid, uuid, boolean) owner to postgres;
revoke all on function public.owner_set_signature_hidden(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.owner_set_signature_hidden(uuid, uuid, boolean) to service_role;

create or replace function public.signer_update_signature(
  p_actor uuid,
  p_signature_id uuid,
  p_name text,
  p_note text,
  p_image text,
  p_position jsonb,
  p_private boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.signatures where id = p_signature_id) then
    return 'not_found';
  end if;
  if not public.signer_can_modify(p_signature_id, p_actor) then
    return 'forbidden';
  end if;
  update public.signatures
  set
    "signatoryName" = coalesce(p_name, "signatoryName"),
    "signatoryNote" = coalesce(p_note, "signatoryNote"),
    "signatureImageUrl" = coalesce(p_image, "signatureImageUrl"),
    position = coalesce(p_position, position),
    private_by_signer = coalesce(p_private, private_by_signer)
  where id = p_signature_id;
  return 'ok';
end;
$$;
alter function public.signer_update_signature(uuid, uuid, text, text, text, jsonb, boolean) owner to postgres;
revoke all on function public.signer_update_signature(uuid, uuid, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.signer_update_signature(uuid, uuid, text, text, text, jsonb, boolean) to service_role;

create or replace function public.delete_signature(p_actor uuid, p_signature_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  board_id uuid;
begin
  select "studentId" into board_id from public.signatures where id = p_signature_id;
  if not found then
    return 'not_found';
  end if;
  if not (
    (board_id = p_actor and public.is_real_actor(p_actor))
    or public.signer_can_modify(p_signature_id, p_actor)
  ) then
    return 'forbidden';
  end if;
  delete from public.signatures where id = p_signature_id;
  return 'ok';
end;
$$;
alter function public.delete_signature(uuid, uuid) owner to postgres;
revoke all on function public.delete_signature(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_signature(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Sentiment quota: 5 successful summaries per board per UTC day.
-- The API reads sentiment_usage_today first and calls consume_sentiment_call
-- only after Gemini returns a summary, so failures do not use a slot.
-- consume_sentiment_call returns the new count, or null when already at 5.
-- Keep 5 in sync with SENTIMENT_CALLS_PER_BOARD_PER_DAY.
-- ---------------------------------------------------------------------------
create or replace function public.sentiment_usage_today(p_student_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select calls from public.sentiment_daily_usage
    where "studentId" = p_student_id and day = (timezone('utc', now()))::date
  ), 0);
$$;
alter function public.sentiment_usage_today(uuid) owner to postgres;
revoke all on function public.sentiment_usage_today(uuid) from public, anon, authenticated;
grant execute on function public.sentiment_usage_today(uuid) to service_role;

create or replace function public.consume_sentiment_call(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
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
end;
$$;
alter function public.consume_sentiment_call(uuid) owner to postgres;
revoke all on function public.consume_sentiment_call(uuid) from public, anon, authenticated;
grant execute on function public.consume_sentiment_call(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- insert_feedback: 5 posts per hashed IP per rolling hour (after Turnstile in
-- /api/feedback). Over the cap nothing is inserted and retry_after is the
-- seconds until a slot frees. Keep 5 in sync with FEEDBACK_PER_IP_PER_HOUR.
-- ---------------------------------------------------------------------------
drop function if exists public.insert_feedback(text, text, text, text, smallint, text);
create function public.insert_feedback(
  p_name text,
  p_email text,
  p_message text,
  p_type text,
  p_rating smallint,
  p_ip text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hits integer;
  retry_after integer;
  new_id uuid;
  v_hash text;
begin
  if p_ip is null or btrim(p_ip) = '' then
    raise exception 'ip_required' using errcode = '23502';
  end if;
  v_hash := private.hash_ip(p_ip);

  perform pg_advisory_xact_lock(hashtextextended('feedback:' || v_hash, 0));

  select count(*)::integer into hits
  from public.feedback_ip_hashes
  where "ipHash" = v_hash and "createdAt" > now() - interval '1 hour';

  if hits >= 5 then
    select ceil(extract(epoch from ("createdAt" + interval '1 hour' - now())))::integer
    into retry_after
    from public.feedback_ip_hashes
    where "ipHash" = v_hash and "createdAt" > now() - interval '1 hour'
    order by "createdAt" asc
    offset (hits - 5)
    limit 1;

    return jsonb_build_object('limited', true, 'retry_after', greatest(coalesce(retry_after, 1), 1));
  end if;

  insert into public.feedback (name, email, message, type, rating)
  values (p_name, p_email, p_message, p_type, p_rating)
  returning id into new_id;

  insert into public.feedback_ip_hashes ("ipHash") values (v_hash);

  return jsonb_build_object('limited', false, 'id', new_id);
end;
$$;
alter function public.insert_feedback(text, text, text, text, smallint, text) owner to postgres;
revoke all on function public.insert_feedback(text, text, text, text, smallint, text) from public, anon, authenticated;
grant execute on function public.insert_feedback(text, text, text, text, smallint, text) to service_role;

-- ---------------------------------------------------------------------------
-- Retention: hashed IP rows older than 30 days (signatures and feedback).
-- Scheduled in step 3 when pg_cron is installed.
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_signed_ips()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  signed_deleted integer;
  feedback_deleted integer;
begin
  delete from public.signed_ips where "signedAt" < now() - interval '30 days';
  get diagnostics signed_deleted = row_count;
  delete from public.feedback_ip_hashes where "createdAt" < now() - interval '30 days';
  get diagnostics feedback_deleted = row_count;
  return signed_deleted + feedback_deleted;
end;
$$;
alter function public.purge_old_signed_ips() owner to postgres;
revoke all on function public.purge_old_signed_ips() from public, anon, authenticated;
grant execute on function public.purge_old_signed_ips() to service_role;

notify pgrst, 'reload schema';

commit;
