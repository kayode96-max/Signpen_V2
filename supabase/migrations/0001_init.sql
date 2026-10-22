-- =============================================================================
-- Signpen: 0001_init.sql
-- Inferred from the Next.js client at the time this migration was written.
-- The live Supabase schema has NOT been exported. Every inference is tagged
-- ASSUMPTION. Diff this against `supabase db dump --schema public` before
-- applying anywhere except a fresh preview project.
--
-- Do not run this against production. Apply it to a preview Supabase project
-- in the same release as the frontend PR that reads get_student_public and
-- feedback_public. Column names that the browser already sends are camelCase
-- and quoted, because PostgREST preserves them (students, signatures).
-- feedback was written with snake_case (created_at) from the contact page.
-- New columns use the names from the product decision: private_by_signer,
-- hidden_by_owner, ipHash.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- students: one row per account owner. id = auth.users.id
--   writes: src/app/dashboard/page.tsx (insert defaults)
--           src/supabase/db-hooks.tsx (explicit column list)
--           src/app/dashboard/settings/page.tsx (update)
--   reads : owner dashboard by id. The public board must NOT select this
--           table. It calls get_student_public (0002).
-- ASSUMPTION: id is always the auth uid.
-- ASSUMPTION: name length 1-120. The settings form requires 2 characters;
--             the dashboard can seed a shorter name from the email local-part.
-- ASSUMPTION: email may be '' for OAuth users. No format check, so a legacy
--             value that is not an email still loads. Length cap 254.
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id                    uuid primary key
                        references auth.users (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 120),
  email                 text check (email is null or char_length(email) <= 254),
  "profilePhotoUrl"     text not null default '',
  "pageSettings"        jsonb not null default jsonb_build_object(
                          'theme', 'light',
                          'pageHeading', '',
                          'pageSubheading', '',
                          'backgroundImageUrl', ''),
  "popupMessageConfig"  jsonb not null default jsonb_build_object('title', '', 'message', ''),
  "createdAt"           timestamptz not null default now(),
  "updatedAt"           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- signatures
-- The signer's auth user id is NOT stored on this table. Realtime and
-- select('*') would otherwise expose it (anon signers are role authenticated).
-- It lives in public.signature_signers, which has no policies for the browser.
-- Names and notes are public unless private_by_signer or hidden_by_owner.
-- ASSUMPTION: image cap 700_000 chars (~512KB PNG data URL). Tune after
--             measuring real rows. Zod enforces the decoded byte cap.
-- ASSUMPTION: name 1-80, note 1-1000. A production row outside those bounds
--             will fail this migration. Add the checks NOT VALID first if so.
-- ---------------------------------------------------------------------------
create table if not exists public.signatures (
  id                   uuid primary key default gen_random_uuid(),
  "studentId"          uuid not null references public.students (id) on delete cascade,
  "signatureImageUrl"  text not null
                       check (
                         char_length("signatureImageUrl") <= 700000
                         and "signatureImageUrl" like 'data:image/png;base64,%'
                       ),
  "signatoryName"      text not null check (char_length(btrim("signatoryName")) between 1 and 80),
  "signatoryNote"      text not null check (char_length(btrim("signatoryNote")) between 1 and 1000),
  position             jsonb not null check (
                         jsonb_typeof(position -> 'x') = 'number'
                         and jsonb_typeof(position -> 'y') = 'number'
                         and (position ->> 'x')::numeric between 0 and 100
                         and (position ->> 'y')::numeric between 0 and 100
                       ),
  "timestamp"          timestamptz not null default now(),
  private_by_signer    boolean not null default false,
  hidden_by_owner      boolean not null default false
);

create index if not exists signatures_student_idx
  on public.signatures ("studentId", "timestamp" desc);

-- One signature per device session per board. Concurrent inserts collide here
-- instead of both succeeding. Nullable only so a deleted auth user can drop
-- the link without deleting the signature on someone else's board... the
-- column itself is on signature_signers, which cascades the link row.
-- ASSUMPTION: "device session" is the anonymous (or real) Supabase auth user.
create table if not exists public.signature_signers (
  "signatureId"   uuid primary key references public.signatures (id) on delete cascade,
  "studentId"     uuid not null references public.students (id) on delete cascade,
  "signerUserId"  uuid not null references auth.users (id) on delete cascade,
  "signedAt"      timestamptz not null default now(),
  unique ("studentId", "signerUserId")
);

create index if not exists signature_signers_user_idx
  on public.signature_signers ("signerUserId");

-- ---------------------------------------------------------------------------
-- signed_ips: hashed-IP rate-limit log. Raw IPs are never stored.
-- The old shape (one row per plaintext IP, primary key studentId+ipAddress)
-- is replaced. Multiple sessions may share an IP up to the soft limit in
-- insert_signature (0002). Service role only (0002).
-- ASSUMPTION: ipHash is hex HMAC-SHA256 (64 chars) produced with IP_HASH_SALT.
-- ---------------------------------------------------------------------------
create table if not exists public.signed_ips (
  id              uuid primary key default gen_random_uuid(),
  "studentId"     uuid not null references public.students (id) on delete cascade,
  "ipHash"        text not null check (char_length("ipHash") between 32 and 128),
  "signerUserId"  uuid references auth.users (id) on delete set null,
  "signedAt"      timestamptz not null default now()
);

create index if not exists signed_ips_board_hash_idx
  on public.signed_ips ("studentId", "ipHash", "signedAt" desc);
create index if not exists signed_ips_hash_time_idx
  on public.signed_ips ("ipHash", "signedAt" desc);
create index if not exists signed_ips_signed_at_idx
  on public.signed_ips ("signedAt");

-- ---------------------------------------------------------------------------
-- thank_you_cards
-- Mapped in db-hooks.tsx but nothing in the current UI writes it.
-- Shape from src/lib/types.ts. ASSUMPTION: the table may not exist in prod.
-- ---------------------------------------------------------------------------
create table if not exists public.thank_you_cards (
  id             uuid primary key default gen_random_uuid(),
  "studentId"    uuid not null references public.students (id) on delete cascade,
  "signatureId"  uuid not null unique references public.signatures (id) on delete cascade,
  "cardDesign"   jsonb not null default '{}'::jsonb,
  "timestamp"    timestamptz not null default now()
);

create index if not exists thank_you_cards_student_idx
  on public.thank_you_cards ("studentId");

-- ---------------------------------------------------------------------------
-- feedback. Inserts go through /api/feedback (service role) after Turnstile.
-- Public reads use feedback_public (0002), which does not include email.
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  email       text not null check (
                char_length(email) <= 254
                and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
              ),
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  type        text not null check (type in ('comment', 'review', 'inquiry')),
  rating      smallint check (rating between 1 and 5),
  created_at  timestamptz not null default now(),
  constraint feedback_rating_only_for_reviews check (type = 'review' or rating is null)
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

-- Per-board Gemini quota. 5 successful reservations per UTC day (0002).
create table if not exists public.sentiment_daily_usage (
  "studentId"  uuid not null references public.students (id) on delete cascade,
  day          date not null,
  calls        integer not null default 0 check (calls >= 0),
  primary key ("studentId", day)
);

-- ---------------------------------------------------------------------------
-- updatedAt
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new."updatedAt" := now();
  return new;
end;
$$;

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Realtime. The client subscribes to students, signatures, and feedback
-- (db-hooks.tsx). feedback is intentionally omitted: the base table contains
-- email addresses, and views cannot be added to a publication. The contact
-- page has to poll feedback_public. signature_signers and signed_ips are
-- omitted so signer ids and IP hashes are not streamed.
-- ASSUMPTION: the supabase_realtime publication already exists.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.students;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.signatures;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

commit;
