-- Rollback for 20261025020000_rls_v2_functions.sql.
-- Run only after the lockdown rollback, with the hotfix app build live.
begin;
drop function if exists public.tg_signatures_guard();   -- lockdown rollback drops this too; repeated so this file is safe on its own
drop function if exists public.insert_signature(uuid, uuid, text, text, text, jsonb, boolean, text, boolean);
drop function if exists public.signature_challenge_required(uuid, text);
drop function if exists public.owner_set_signature_hidden(uuid, uuid, boolean);
drop function if exists public.signer_update_signature(uuid, uuid, text, text, text, jsonb, boolean);
drop function if exists public.delete_signature(uuid, uuid);
drop function if exists public.sentiment_usage_today(uuid);
drop function if exists public.consume_sentiment_call(uuid);
drop function if exists public.insert_feedback(text, text, text, text, smallint, text);
drop function if exists public.purge_old_signed_ips();
drop function if exists public.signatures_public(uuid);
drop function if exists public.signer_has_signed(uuid, uuid);
drop function if exists public.is_real_actor(uuid);
drop function if exists public.signer_can_modify(uuid);
drop function if exists public.signer_can_modify(uuid, uuid);
drop function if exists public.signer_owns(uuid);
drop function if exists public.is_real_user();

-- record_signed_ip: hotfix body
create or replace function public.record_signed_ip(p_student_id uuid, p_ip text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
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
revoke all on function public.record_signed_ip(uuid, text) from public, anon, authenticated;
grant execute on function public.record_signed_ip(uuid, text) to service_role;

-- feedback_public: hotfix shape (drop first_name; CREATE OR REPLACE cannot drop a column)
drop view if exists public.feedback_public;
create view public.feedback_public with (security_invoker = true) as
  select f.id, f.name, f.message, f.rating, f.type, f.created_at from public.feedback f;
revoke all on public.feedback_public from public, anon, authenticated;
grant select on public.feedback_public to anon, authenticated;
notify pgrst, 'reload schema';
commit;
