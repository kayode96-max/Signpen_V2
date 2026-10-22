import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SENTIMENT_CALLS_PER_BOARD_PER_DAY,
  SIGNATURES_PER_IP_PER_BOARD_PER_HOUR,
  FEEDBACK_PER_IP_PER_HOUR,
  SIGNED_IP_RETENTION_DAYS,
} from '@/lib/security/limits';
import {
  assertGeminiModel,
  buildSentimentPrompt,
  interpretSentimentQuota,
  notesFromRows,
  secondsUntilNextUtcDay,
  sentimentQuotaOpen,
} from '@/lib/server/sentiment';
import { interpretTurnstile } from '@/lib/server/turnstile';

describe('buildSentimentPrompt', () => {
  it('sends notes and nothing else', () => {
    const prompt = buildSentimentPrompt(notesFromRows([
      { signatoryNote: 'So proud of you', signatoryName: 'Mum', signatureImageUrl: 'data:image/png;base64,aaaa' } as {
        signatoryNote: string;
      },
      { signatoryNote: '   ' },
    ]));
    expect(prompt).toContain('So proud of you');
    expect(prompt).not.toContain('Mum');
    expect(prompt).not.toContain('data:image');
    expect(prompt).not.toContain('@');
  });

  it('returns null when there is no text and caps a huge note', () => {
    expect(buildSentimentPrompt(['   ', ''])).toBeNull();
    const prompt = buildSentimentPrompt(['x'.repeat(5000)]);
    expect(prompt).toBeTruthy();
    expect(prompt!.split('x').length - 1).toBe(1000);
  });
});

describe('sentiment quota and model name', () => {
  it('counts whole seconds until the next UTC midnight', () => {
    expect(secondsUntilNextUtcDay(new Date('2026-10-22T00:00:00.000Z'))).toBe(86400);
    expect(secondsUntilNextUtcDay(new Date('2026-10-22T23:00:00.000Z'))).toBe(3600);
    expect(secondsUntilNextUtcDay(new Date('2026-10-22T23:59:59.200Z'))).toBe(1);
  });

  it('treats a null reservation as the daily limit and a count under 5 as open', () => {
    expect(SENTIMENT_CALLS_PER_BOARD_PER_DAY).toBe(5);
    expect(interpretSentimentQuota(null)).toBe('exhausted');
    expect(interpretSentimentQuota(Number.NaN)).toBe('exhausted');
    expect(interpretSentimentQuota(5)).toBe('ok');
    expect(sentimentQuotaOpen(0)).toBe(true);
    expect(sentimentQuotaOpen(4)).toBe(true);
    expect(sentimentQuotaOpen(5)).toBe(false);
    expect(sentimentQuotaOpen(null)).toBe(false);
  });

  it('rejects a model name that could change the request path', () => {
    expect(assertGeminiModel('gemini-2.5-flash')).toBe('gemini-2.5-flash');
    expect(() => assertGeminiModel('gemini/../other')).toThrow();
    expect(() => assertGeminiModel('gemini 2')).toThrow();
  });
});

describe('turnstile verdict', () => {
  it('accepts only an explicit success flag', () => {
    expect(interpretTurnstile({ success: true })).toBe(true);
    expect(interpretTurnstile({ success: false })).toBe(false);
    expect(interpretTurnstile(null)).toBe(false);
    expect(interpretTurnstile({})).toBe(false);
  });
});

describe('migration contract', () => {
  const root = process.cwd();
  const init = readFileSync(path.join(root, 'supabase/migrations/0001_init.sql'), 'utf8');
  const rls = readFileSync(path.join(root, 'supabase/migrations/0002_rls.sql'), 'utf8');

  it('keeps the public board RPC and the feedback view shape', () => {
    const fn = rls.slice(rls.indexOf('function public.get_student_public'));
    const returns = fn.slice(0, fn.indexOf('language sql'));
    expect(returns).toContain('id uuid');
    expect(returns).toContain('name text');
    expect(returns).toContain('"profilePhotoUrl" text');
    expect(returns).toContain('"pageSettings" jsonb');
    expect(returns).toContain('"popupMessageConfig" jsonb');
    expect(returns).not.toContain('email');
    expect(rls).toContain('grant execute on function public.get_student_public(uuid) to anon, authenticated');
    expect(rls).not.toMatch(/grant select on public\.students_public/i);

    expect(rls).toMatch(
      /split_part\(btrim\(name\), ' ', 1\) as first_name,[\s\S]*message,[\s\S]*type,[\s\S]*rating,[\s\S]*created_at/
    );
    expect(rls).toContain('order by created_at desc');
    expect(rls).toContain('revoke all on table public.feedback from public, anon, authenticated');
    expect(rls).not.toMatch(/create policy feedback_.*insert/i);
  });

  it('stores a hash instead of a raw IP and locks the rate-limit numbers', () => {
    expect(init).toContain('"ipHash"');
    expect(init).not.toMatch(/"ipAddress"\s+text/);
    expect(init).toContain('private_by_signer');
    expect(init).toContain('hidden_by_owner');
    expect(init).toContain('unique ("studentId", "signerUserId")');
    expect(init).toContain('create table if not exists public.feedback_ip_hashes');

    const insertFn = rls.slice(
      rls.indexOf('function public.insert_signature('),
      rls.indexOf('alter function public.insert_signature')
    );
    expect(insertFn).toContain(`if board_hits >= ${SIGNATURES_PER_IP_PER_BOARD_PER_HOUR}`);
    expect(insertFn).toContain("interval '1 hour'");
    expect(insertFn).toContain('challenge_required');
    expect(insertFn).toContain('p_challenge_passed');
    expect(insertFn).not.toContain('global_hits');
    expect(insertFn).not.toContain("interval '24 hours'");
    expect(rls).not.toMatch(/raise exception 'rate_limited'/);

    const challengeFn = rls.slice(
      rls.indexOf('function public.signature_challenge_required'),
      rls.indexOf('alter function public.signature_challenge_required')
    );
    expect(challengeFn).toContain(`count(*) >= ${SIGNATURES_PER_IP_PER_BOARD_PER_HOUR}`);
    expect(challengeFn).toContain("interval '1 hour'");
    expect(challengeFn).not.toMatch(/signerUserId|returns table/i);
    expect(rls).toContain(
      'grant execute on function public.signature_challenge_required(uuid, text) to service_role'
    );

    const feedbackFn = rls.slice(
      rls.indexOf('function public.insert_feedback'),
      rls.indexOf('alter function public.insert_feedback')
    );
    expect(feedbackFn).toContain(`if hits >= ${FEEDBACK_PER_IP_PER_HOUR}`);
    expect(feedbackFn).toContain("interval '1 hour'");
    expect(feedbackFn).toContain("'limited', true");
    expect(feedbackFn).toContain('offset (hits - 5)');
    expect(feedbackFn).not.toContain('feedback_rate_limited');

    expect(rls).toContain(`interval '${SIGNED_IP_RETENTION_DAYS} days'`);
    expect(rls).toContain('delete from public.feedback_ip_hashes');
    expect(rls).toContain(`calls < ${SENTIMENT_CALLS_PER_BOARD_PER_DAY}`);
    expect(rls).toContain('function public.sentiment_usage_today');
    expect(rls).toContain('revoke all on table public.signed_ips from public, anon, authenticated');
    expect(rls).toContain('revoke all on table public.feedback_ip_hashes from public, anon, authenticated');
  });

  it('returns public shirt rows and blanks a private note', () => {
    const fn = rls.slice(
      rls.indexOf('function public.signatures_public(p_id uuid)'),
      rls.indexOf('alter function public.signatures_public')
    );
    const returns = fn.slice(0, fn.indexOf('language sql'));
    expect(returns).toContain('id uuid');
    expect(returns).toContain('"studentId" uuid');
    expect(returns).toContain('"signatoryName" text');
    expect(returns).toContain('"signatureImageUrl" text');
    expect(returns).toContain('"signatoryNote" text');
    expect(returns).toContain('is_private boolean');
    expect(returns).toContain('position jsonb');
    expect(returns).toContain('"timestamp" timestamptz');
    expect(returns).not.toMatch(/private_by_signer|hidden_by_owner|signerUserId|ipHash|device_id|signer_slot/);
    expect(fn).toContain('security definer');

    const selectList = fn.slice(fn.indexOf('select'), fn.indexOf('from public.signatures'));
    expect(selectList).toContain('case when s.private_by_signer then null else s."signatoryNote" end');
    expect(selectList).toContain('s.private_by_signer as is_private');
    expect(selectList).toContain('s.position');
    expect(selectList).not.toMatch(/signerUserId|ipHash|device_id|client_signature_id|signer_slot|hidden_by_owner/);

    const where = fn.slice(fn.indexOf('where'), fn.indexOf('order by'));
    expect(where).toContain('s."studentId" = p_id');
    expect(where).toContain('s.hidden_by_owner = false');
    expect(where).not.toContain('private_by_signer = false');
    expect(where).not.toMatch(/\bor\b/i);
    expect(fn).toContain('order by s."timestamp" asc');
    expect(fn).not.toMatch(/signature_signers|signed_ips|signerUserId|ipHash|device_id/);
    expect(rls).toContain('grant execute on function public.signatures_public(uuid) to anon, authenticated');

    const alias = rls.slice(
      rls.indexOf('function public.get_board_signatures(p_id uuid)'),
      rls.indexOf('alter function public.get_board_signatures')
    );
    expect(alias).toContain('select * from public.signatures_public(p_id)');
    expect(alias).not.toMatch(/from public\.signatures s/);
    expect(alias).toContain('is_private boolean');
    expect(rls).toContain('grant execute on function public.get_board_signatures(uuid) to anon, authenticated');

    expect(rls).toContain('create policy signatures_select on public.signatures');
    expect(rls).toContain('grant select on table public.signatures to anon, authenticated');
    const policy = rls.slice(
      rls.indexOf('create policy signatures_select'),
      rls.indexOf('function public.tg_signatures_guard')
    );
    expect(policy).toContain('private_by_signer = false and hidden_by_owner = false');
    expect(policy).toContain('"studentId" = auth.uid() and public.is_real_user()');
  });

  it('does not let a hidden signature occupy a spot on insert', () => {
    const fn = rls.slice(
      rls.indexOf('function public.insert_signature('),
      rls.indexOf('alter function public.insert_signature')
    );
    const beforeInsert = fn.slice(fn.indexOf('begin'), fn.indexOf('insert into public.signatures'));
    expect(beforeInsert).not.toContain('hidden_by_owner');
    expect(beforeInsert).not.toContain('position');
    expect(beforeInsert).not.toMatch(/from public\.signatures/);
    expect(fn).toContain('p_position,');
    expect(fn).not.toMatch(/overlap|occupied|too close/i);
  });

  it('lets only the signer change private_by_signer', () => {
    const guard = rls.slice(
      rls.indexOf('function public.tg_signatures_guard()'),
      rls.indexOf('revoke all on function public.tg_signatures_guard')
    );
    const owner = guard.slice(guard.indexOf('is_real_user()'), guard.indexOf('signer_can_modify'));
    expect(owner).toContain('new.private_by_signer is distinct from old.private_by_signer');
    expect(owner).toContain('only the signer can change private_by_signer');
    expect(owner.indexOf('only the signer can change private_by_signer')).toBeLessThan(
      owner.lastIndexOf('return new')
    );
    expect(owner).not.toContain('hidden_by_owner');

    const signer = guard.slice(guard.indexOf('signer_can_modify(old.id)'));
    expect(signer).toContain('only the board owner can change hidden_by_owner');
    expect(signer).not.toContain('only the signer can change private_by_signer');
    expect(rls).toContain('and s."timestamp" > now() - interval \'24 hours\'');
  });

  it('closes direct signature updates and deletes', () => {
    expect(rls).toContain(
      'revoke update, delete on table public.signatures from public, anon, authenticated'
    );
    expect(rls).not.toMatch(/grant update \(/);
    expect(rls).not.toContain('grant delete on table public.signatures');
    expect(rls).toContain('drop policy if exists signatures_owner_update on public.signatures');
    expect(rls).toContain('drop policy if exists signatures_signer_update on public.signatures');
    expect(rls).toContain('drop policy if exists signatures_owner_delete on public.signatures');
    expect(rls).toContain('drop policy if exists signatures_signer_delete on public.signatures');
    expect(rls).not.toContain('create policy signatures_owner_update');
    expect(rls).not.toContain('create policy signatures_signer_update');
    expect(rls).not.toContain('create policy signatures_owner_delete');
    expect(rls).not.toContain('create policy signatures_signer_delete');

    const writes = [
      'public.owner_set_signature_hidden(uuid, uuid, boolean)',
      'public.signer_update_signature(uuid, uuid, text, text, text, jsonb, boolean)',
      'public.delete_signature(uuid, uuid)',
    ];
    for (const signature of writes) {
      expect(rls).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(rls).toContain(`grant execute on function ${signature} to service_role`);
      expect(rls).not.toContain(`grant execute on function ${signature} to anon`);
      expect(rls).not.toContain(`grant execute on function ${signature} to authenticated`);
    }

    const ownerFn = rls.slice(
      rls.indexOf('function public.owner_set_signature_hidden('),
      rls.indexOf('alter function public.owner_set_signature_hidden')
    );
    expect(ownerFn).toContain('security definer');
    expect(ownerFn).toContain("return 'not_found'");
    expect(ownerFn).toContain("return 'forbidden'");
    expect(ownerFn).toContain('public.is_real_actor(p_actor)');
    expect(ownerFn).toContain('set hidden_by_owner = p_hidden');
    expect(ownerFn).not.toContain('private_by_signer');
    expect(ownerFn).not.toContain('signatoryName');

    const signerFn = rls.slice(
      rls.indexOf('function public.signer_update_signature('),
      rls.indexOf('alter function public.signer_update_signature')
    );
    expect(signerFn).toContain('security definer');
    expect(signerFn).toContain("return 'not_found'");
    expect(signerFn).toContain("return 'forbidden'");
    expect(signerFn).toContain('public.signer_can_modify(p_signature_id, p_actor)');
    expect(signerFn).toContain('private_by_signer = coalesce(p_private, private_by_signer)');
    expect(signerFn).not.toContain('hidden_by_owner');

    const deleteFn = rls.slice(
      rls.indexOf('function public.delete_signature('),
      rls.indexOf('alter function public.delete_signature')
    );
    expect(deleteFn).toContain('security definer');
    expect(deleteFn).toContain("return 'not_found'");
    expect(deleteFn).toContain("return 'forbidden'");
    expect(deleteFn).toContain('public.is_real_actor(p_actor)');
    expect(deleteFn).toContain('public.signer_can_modify(p_signature_id, p_actor)');

    expect(rls).toContain(
      'revoke all on function public.is_real_actor(uuid) from public, anon, authenticated, service_role'
    );
    expect(rls).not.toContain('grant execute on function public.is_real_actor(uuid)');
    expect(rls).toContain(
      'revoke all on function public.signer_can_modify(uuid, uuid) from public, anon, authenticated'
    );
    expect(rls).toContain(
      'grant execute on function public.signer_can_modify(uuid, uuid) to service_role'
    );
    expect(rls).not.toContain(
      'grant execute on function public.signer_can_modify(uuid, uuid) to authenticated'
    );
  });
});
