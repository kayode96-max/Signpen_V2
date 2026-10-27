-- Rollback for 20261025010000_rls_v2_schema.sql.
-- DESTRUCTIVE. Run after the functions rollback.
-- Drops signer links, hidden/private flags, hashed-IP logs, and duplicate
-- signed_ips rows. Blanks private notes first (signatoryNote is set null
-- where private_by_signer) before those flags are dropped. Also drops
-- feedback/sentiment logs and collapses signed_ips to one row per
-- (board, IP hash). Private notes would otherwise become public again
-- once the flag is gone.
begin;
drop table if exists public.signature_signers;
drop table if exists public.feedback_ip_hashes;
drop table if exists public.sentiment_daily_usage;

drop trigger if exists students_set_updated_at on public.students;
drop function if exists public.tg_set_updated_at();
alter table public.students drop constraint if exists students_name_len;
alter table public.students drop constraint if exists students_email_len;
alter table public.students drop column if exists "updatedAt";
alter table public.students alter column "createdAt" drop not null;
alter table public.students alter column "profilePhotoUrl" drop default;
alter table public.students alter column "pageSettings" drop default;
alter table public.students alter column "popupMessageConfig" drop default;

-- privacy: never expose a private note after the flag is gone
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='signatures' and column_name='private_by_signer') then
    update public.signatures set "signatoryNote" = null where private_by_signer;
  end if;
end $$;
drop index if exists public.signatures_student_idx;
alter table public.signatures drop constraint if exists signatures_image_png;
alter table public.signatures drop constraint if exists signatures_name_len;
alter table public.signatures drop constraint if exists signatures_note_len;
alter table public.signatures drop constraint if exists signatures_position_xy;
alter table public.signatures drop column if exists private_by_signer;
alter table public.signatures drop column if exists hidden_by_owner;
alter table public.signatures alter column "timestamp" drop not null;

drop index if exists public.signed_ips_board_hash_idx;
drop index if exists public.signed_ips_signed_at_idx;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='signed_ips' and column_name='id') then
    delete from public.signed_ips a using public.signed_ips b
     where a."studentId" = b."studentId" and a."ipHash" = b."ipHash" and a.id > b.id;
    alter table public.signed_ips drop constraint if exists signed_ips_pkey;
    alter table public.signed_ips drop column id;
    alter table public.signed_ips add constraint signed_ips_pkey primary key ("studentId", "ipHash");
  end if;
end $$;
alter table public.signed_ips alter column "signedAt" drop not null;

alter table public.thank_you_cards drop constraint if exists thank_you_cards_signature_unique;
drop index if exists public.thank_you_cards_student_idx;
alter table public.thank_you_cards alter column "cardDesign" drop default;
alter table public.thank_you_cards alter column "timestamp" drop not null;

alter table public.feedback drop constraint if exists feedback_name_len;
alter table public.feedback drop constraint if exists feedback_email_format;
alter table public.feedback drop constraint if exists feedback_message_len;
alter table public.feedback drop constraint if exists feedback_type_valid;
alter table public.feedback drop constraint if exists feedback_rating_range;
alter table public.feedback drop constraint if exists feedback_rating_only_for_reviews;
drop index if exists public.feedback_created_idx;
notify pgrst, 'reload schema';
commit;
