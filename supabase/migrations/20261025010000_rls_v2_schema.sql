-- =============================================================================
-- Signpen RLS v2, step 1 of 3: schema changes on the EXISTING production tables.
--
-- Requires: 20261024050000_security_hotfix.sql (PR #24) already applied.
-- Replaces PR #15's 0001_init.sql. Production already has students, signatures,
-- signed_ips, thank_you_cards and feedback, so this file ALTERs them instead
-- of `create table if not exists` (which silently skipped every change).
--
-- Additive and backward compatible with the hotfix app build: no grants or
-- policies change here, so the currently deployed app keeps working.
-- Idempotent: every statement is guarded and the file can be re-run.
-- Backfills run before the constraint they satisfy. CHECKs are added NOT VALID
-- and then validated, so a bad row aborts this transaction instead of leaving
-- a half-applied schema.
--
-- New tables (signature_signers, feedback_ip_hashes, sentiment_daily_usage)
-- get RLS + FORCE RLS, no policies, and Supabase's default anon/authenticated
-- grants revoked: service role only.
-- =============================================================================

begin;

-- Helper: add a CHECK constraint once, NOT VALID, then validate it.
create or replace function pg_temp.add_check(p_table regclass, p_name text, p_expr text)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = p_table and conname = p_name
  ) then
    execute format('alter table %s add constraint %I check (%s) not valid', p_table, p_name, p_expr);
  end if;
  execute format('alter table %s validate constraint %I', p_table, p_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- students
--   email stays NOT NULL (production shape). OAuth users may have ''.
--   profilePhotoUrl stays nullable; new rows default to ''.
--   updatedAt: added with a default, maintained by a trigger.
-- ---------------------------------------------------------------------------
alter table public.students add column if not exists "updatedAt" timestamptz;
update public.students set "updatedAt" = coalesce("createdAt", now()) where "updatedAt" is null;
alter table public.students alter column "updatedAt" set default now();
alter table public.students alter column "updatedAt" set not null;

update public.students set "createdAt" = now() where "createdAt" is null;
alter table public.students alter column "createdAt" set default now();
alter table public.students alter column "createdAt" set not null;

alter table public.students alter column "profilePhotoUrl" set default '';
alter table public.students alter column "pageSettings" set default jsonb_build_object(
  'theme', 'light', 'pageHeading', '', 'pageSubheading', '', 'backgroundImageUrl', '');
alter table public.students alter column "popupMessageConfig" set default
  jsonb_build_object('title', '', 'message', '');

select pg_temp.add_check('public.students', 'students_name_len',
  'char_length(name) between 1 and 120');
select pg_temp.add_check('public.students', 'students_email_len',
  'char_length(email) <= 254');

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new."updatedAt" := now();
  return new;
end;
$$;
revoke all on function public.tg_set_updated_at() from public, anon, authenticated;
grant execute on function public.tg_set_updated_at() to authenticated;

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- signatures
--   private_by_signer / hidden_by_owner: NOT NULL DEFAULT false. Postgres 11+
--   adds a constant default without rewriting the table; existing rows read false.
--   signatoryNote stays nullable on the table (production shape, no NULLs today);
--   a present note must be 1-1000 characters.
-- ---------------------------------------------------------------------------
alter table public.signatures add column if not exists private_by_signer boolean not null default false;
alter table public.signatures add column if not exists hidden_by_owner  boolean not null default false;

update public.signatures set "timestamp" = now() where "timestamp" is null;
alter table public.signatures alter column "timestamp" set default now();
alter table public.signatures alter column "timestamp" set not null;

select pg_temp.add_check('public.signatures', 'signatures_image_png',
  'char_length("signatureImageUrl") <= 700000 and "signatureImageUrl" like ''data:image/png;base64,%''');
select pg_temp.add_check('public.signatures', 'signatures_name_len',
  'char_length(btrim("signatoryName")) between 1 and 80');
select pg_temp.add_check('public.signatures', 'signatures_note_len',
  '"signatoryNote" is null or char_length(btrim("signatoryNote")) between 1 and 1000');
select pg_temp.add_check('public.signatures', 'signatures_position_xy',
  'jsonb_typeof(position -> ''x'') = ''number''
   and jsonb_typeof(position -> ''y'') = ''number''
   and (position ->> ''x'')::numeric between 0 and 100
   and (position ->> ''y'')::numeric between 0 and 100');

create index if not exists signatures_student_idx
  on public.signatures ("studentId", "timestamp" desc);

-- Signer link: who (auth user, usually anonymous) created each signature.
-- Not on signatures itself so realtime/select never expose signer ids.
-- Existing production signatures have no link: their signers cannot edit them.
create table if not exists public.signature_signers (
  "signatureId"   uuid primary key references public.signatures (id) on delete cascade,
  "studentId"     uuid not null references public.students (id) on delete cascade,
  "signerUserId"  uuid not null references auth.users (id) on delete cascade,
  "signedAt"      timestamptz not null default now(),
  constraint signature_signers_one_per_session unique ("studentId", "signerUserId")
);
create index if not exists signature_signers_user_idx
  on public.signature_signers ("signerUserId");

-- ---------------------------------------------------------------------------
-- signed_ips: keeps the hotfix shape (studentId, ipHash, signedAt; salted
-- SHA-256 from private.hash_ip). The hotfix primary key (studentId, ipHash)
-- allowed one row per IP per board; the hourly cap (100 per hashed IP per
-- board) needs one row per signature, so the key moves to a surrogate id.
-- Existing rows are kept.
-- ---------------------------------------------------------------------------
alter table public.signed_ips add column if not exists id bigint generated by default as identity;

do $$
declare
  pk_cols text;
begin
  select string_agg(a.attname, ',' order by a.attname)
  into pk_cols
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.signed_ips'::regclass and c.contype = 'p';

  if pk_cols is distinct from 'id' then
    if pk_cols is not null then
      execute (
        select format('alter table public.signed_ips drop constraint %I', conname)
        from pg_constraint
        where conrelid = 'public.signed_ips'::regclass and contype = 'p'
      );
    end if;
    alter table public.signed_ips add constraint signed_ips_pkey primary key (id);
  end if;
end;
$$;

update public.signed_ips set "signedAt" = now() where "signedAt" is null;
alter table public.signed_ips alter column "signedAt" set default now();
alter table public.signed_ips alter column "signedAt" set not null;

create index if not exists signed_ips_board_hash_idx
  on public.signed_ips ("studentId", "ipHash", "signedAt" desc);
create index if not exists signed_ips_signed_at_idx
  on public.signed_ips ("signedAt");

-- ---------------------------------------------------------------------------
-- thank_you_cards: one card per signature (no duplicates on production).
-- ---------------------------------------------------------------------------
alter table public.thank_you_cards alter column "cardDesign" set default '{}'::jsonb;
update public.thank_you_cards set "timestamp" = now() where "timestamp" is null;
alter table public.thank_you_cards alter column "timestamp" set default now();
alter table public.thank_you_cards alter column "timestamp" set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.thank_you_cards'::regclass and conname = 'thank_you_cards_signature_unique'
  ) then
    alter table public.thank_you_cards
      add constraint thank_you_cards_signature_unique unique ("signatureId");
  end if;
end;
$$;
create index if not exists thank_you_cards_student_idx
  on public.thank_you_cards ("studentId");

-- ---------------------------------------------------------------------------
-- feedback: rating stays integer (production type). created_at default unchanged.
-- ---------------------------------------------------------------------------
select pg_temp.add_check('public.feedback', 'feedback_name_len',
  'char_length(btrim(name)) between 1 and 80');
select pg_temp.add_check('public.feedback', 'feedback_email_format',
  'char_length(email) <= 254 and email ~* ''^[^@\s]+@[^@\s]+\.[^@\s]+$''');
select pg_temp.add_check('public.feedback', 'feedback_message_len',
  'char_length(btrim(message)) between 1 and 2000');
select pg_temp.add_check('public.feedback', 'feedback_type_valid',
  'type in (''comment'', ''review'', ''inquiry'')');
select pg_temp.add_check('public.feedback', 'feedback_rating_range',
  'rating is null or rating between 1 and 5');
select pg_temp.add_check('public.feedback', 'feedback_rating_only_for_reviews',
  'type = ''review'' or rating is null');

create index if not exists feedback_created_idx on public.feedback (created_at desc);

-- Hashed-IP log for the feedback cap (5 per hashed IP per rolling hour).
-- Same salted SHA-256 as signed_ips (private.hash_ip).
create table if not exists public.feedback_ip_hashes (
  id           bigint generated by default as identity primary key,
  "ipHash"     text not null constraint feedback_ip_hashes_sha256 check ("ipHash" ~ '^[0-9a-f]{64}$'),
  "createdAt"  timestamptz not null default now()
);
create index if not exists feedback_ip_hashes_hash_time_idx
  on public.feedback_ip_hashes ("ipHash", "createdAt" desc);
create index if not exists feedback_ip_hashes_created_idx
  on public.feedback_ip_hashes ("createdAt");

-- Per-board Gemini quota: 5 successful summaries per UTC day.
create table if not exists public.sentiment_daily_usage (
  "studentId"  uuid not null references public.students (id) on delete cascade,
  day          date not null,
  calls        integer not null default 0 check (calls >= 0),
  primary key ("studentId", day)
);

-- ---------------------------------------------------------------------------
-- New tables: service role only. Supabase default privileges grant ALL to
-- anon and authenticated on every new public table; take that back.
-- ---------------------------------------------------------------------------
alter table public.signature_signers     enable row level security;
alter table public.feedback_ip_hashes    enable row level security;
alter table public.sentiment_daily_usage enable row level security;
alter table public.signature_signers     force row level security;
alter table public.feedback_ip_hashes    force row level security;
alter table public.sentiment_daily_usage force row level security;

revoke all on table public.signature_signers     from public, anon, authenticated;
revoke all on table public.feedback_ip_hashes    from public, anon, authenticated;
revoke all on table public.sentiment_daily_usage from public, anon, authenticated;
revoke all on sequence public.feedback_ip_hashes_id_seq from public, anon, authenticated;
revoke all on sequence public.signed_ips_id_seq from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
