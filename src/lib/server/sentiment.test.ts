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

  it('returns only public signature columns for one board', () => {
    const fn = rls.slice(
      rls.indexOf('function public.get_board_signatures(p_id uuid)'),
      rls.indexOf('alter function public.get_board_signatures')
    );
    const returns = fn.slice(0, fn.indexOf('language sql'));
    expect(returns).toContain('id uuid');
    expect(returns).toContain('"studentId" uuid');
    expect(returns).toContain('"signatureImageUrl" text');
    expect(returns).toContain('"signatoryName" text');
    expect(returns).toContain('"signatoryNote" text');
    expect(returns).toContain('position jsonb');
    expect(returns).toContain('"timestamp" timestamptz');
    expect(returns).not.toMatch(/private_by_signer|hidden_by_owner|signerUserId|ipHash|email/);
    expect(fn).toContain('security definer');

    const where = fn.slice(fn.indexOf('where'), fn.indexOf('order by'));
    expect(where).toContain('s."studentId" = p_id');
    expect(where).toContain('s.private_by_signer = false');
    expect(where).toContain('s.hidden_by_owner = false');
    expect(where).not.toMatch(/\bor\b/i);
    expect(fn).toContain('order by s."timestamp" asc');
    expect(fn).not.toMatch(/signature_signers|signed_ips|signerUserId|ipHash/);
    expect(rls).toContain('grant execute on function public.get_board_signatures(uuid) to anon, authenticated');
    expect(rls).toContain('create policy signatures_select on public.signatures');
    expect(rls).toContain('grant select on table public.signatures to anon, authenticated');
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
});
