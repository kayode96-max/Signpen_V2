import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SENTIMENT_CALLS_PER_BOARD_PER_DAY,
  SIGNATURES_PER_IP_PER_BOARD_PER_DAY,
  SIGNATURES_PER_IP_PER_DAY,
  SIGNED_IP_RETENTION_DAYS,
} from '@/lib/security/limits';
import {
  assertGeminiModel,
  buildSentimentPrompt,
  interpretSentimentQuota,
  notesFromRows,
  secondsUntilNextUtcDay,
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

  it('treats a null reservation as the daily limit', () => {
    expect(SENTIMENT_CALLS_PER_BOARD_PER_DAY).toBe(5);
    expect(interpretSentimentQuota(null)).toBe('exhausted');
    expect(interpretSentimentQuota(Number.NaN)).toBe('exhausted');
    expect(interpretSentimentQuota(5)).toBe('ok');
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
    expect(rls).toContain(`if board_hits >= ${SIGNATURES_PER_IP_PER_BOARD_PER_DAY}`);
    expect(rls).toContain(`if global_hits >= ${SIGNATURES_PER_IP_PER_DAY}`);
    expect(rls).toContain(`interval '${SIGNED_IP_RETENTION_DAYS} days'`);
    expect(rls).toContain(`calls < ${SENTIMENT_CALLS_PER_BOARD_PER_DAY}`);
    expect(rls).toContain('revoke all on table public.signed_ips from public, anon, authenticated');
    expect(rls).toContain("interval '24 hours'");
  });
});
