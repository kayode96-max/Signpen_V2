import { describe, expect, it, vi } from 'vitest';
import {
  CHALLENGE_REQUIRED,
  CHALLENGE_UNAVAILABLE,
  createSignature,
  mapSignatureWriteError,
  type SignatureWriteArgs,
  type SignatureWriteResult,
  type TurnstileCheck,
} from '@/lib/server/signatures';

const SALT = 'preview-salt-value-01';
const IP = '203.0.113.44';
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const body = {
  studentId: '11111111-1111-4111-8111-111111111111',
  signatureImageUrl: `data:image/png;base64,${TINY_PNG}`,
  signatoryName: 'Grace',
  signatoryNote: 'You did it',
  position: { x: 12.5, y: 40 },
  privateBySigner: true,
};

function harness(result: SignatureWriteResult | ((args: SignatureWriteArgs) => SignatureWriteResult)) {
  const calls: SignatureWriteArgs[] = [];
  const write = async (args: SignatureWriteArgs) => {
    calls.push(args);
    return typeof result === 'function' ? result(args) : result;
  };
  return { calls, write };
}

describe('mapSignatureWriteError', () => {
  it('maps board, duplicate, and check failures, and does not hard-block the hourly cap', () => {
    expect(mapSignatureWriteError({ code: 'P0002', message: 'board_not_found' }).status).toBe(404);
    expect(mapSignatureWriteError({ code: '23503', message: 'foreign key' }).status).toBe(404);
    expect(mapSignatureWriteError({ code: 'P0004', message: 'challenge_required' })).toEqual({
      status: 429,
      error: CHALLENGE_REQUIRED,
    });
    expect(mapSignatureWriteError({ code: '23505', message: 'already_signed' }).status).toBe(409);
    expect(mapSignatureWriteError({ code: '23514', message: 'check' }).status).toBe(400);
    expect(mapSignatureWriteError({ message: 'connection reset' }).status).toBe(500);
  });
});

describe('createSignature', () => {
  it('hashes the IP, stores the signer id, and never sends the raw address', async () => {
    const { calls, write } = harness({ ok: true, id: 'sig-1' });
    const response = await createSignature(body, {
      userId: '22222222-2222-4222-8222-222222222222',
      ip: IP,
      salt: SALT,
      write,
    });

    expect(response).toEqual({
      status: 201,
      body: { signature_id: 'sig-1' },
      boardId: body.studentId,
    });
    expect(calls).toHaveLength(1);
    const args = calls[0];
    expect(args.p_signer_user_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(args.p_private).toBe(true);
    expect(args.p_challenge_passed).toBe(false);
    expect(args.p_ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain(IP);
    expect(args).not.toHaveProperty('hidden_by_owner');
  });

  it('does not write when validation, the salt, or the IP is missing', async () => {
    const { calls, write } = harness({ ok: true, id: 'sig-1' });
    const ctx = { userId: '22222222-2222-4222-8222-222222222222', ip: IP, salt: SALT, write };

    expect((await createSignature({ ...body, position: { x: 101, y: 1 } }, ctx)).status).toBe(400);
    expect((await createSignature(body, { ...ctx, salt: 'short' })).status).toBe(503);
    expect((await createSignature(body, { ...ctx, ip: null })).status).toBe(400);
    expect((await createSignature(body, { ...ctx, userId: '' })).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('returns 404 and 409 from the write without hiding the failure', async () => {
    const missing = harness({ ok: false, code: 'P0002', message: 'board_not_found' });
    expect((await createSignature(body, { userId: 'u', ip: IP, salt: SALT, write: missing.write })).status).toBe(404);

    const duplicate = harness({ ok: false, code: '23505', message: 'already_signed' });
    expect((await createSignature(body, { userId: 'u', ip: IP, salt: SALT, write: duplicate.write })).status).toBe(409);
  });

  it('asks for a Turnstile token once the hourly board cap is reached', async () => {
    const limited = harness({ ok: false, code: 'P0004', message: 'challenge_required' });
    const verifyTurnstile = vi.fn(async (): Promise<TurnstileCheck> => 'valid');
    const response = await createSignature(body, {
      userId: 'u',
      ip: IP,
      salt: SALT,
      write: limited.write,
      verifyTurnstile,
    });

    expect(response).toEqual({ status: 429, body: { error: CHALLENGE_REQUIRED } });
    expect(JSON.stringify(response.body)).not.toMatch(/count|ipHash|203\.0\.113/);
    expect(limited.calls).toHaveLength(1);
    expect(limited.calls[0].p_challenge_passed).toBe(false);
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it('rejects an invalid token without writing a second time', async () => {
    const limited = harness({ ok: false, code: 'P0004', message: 'challenge_required' });
    const verifyTurnstile = vi.fn(async (): Promise<TurnstileCheck> => 'invalid');
    const response = await createSignature(
      { ...body, turnstileToken: 'not-a-pass' },
      { userId: 'u', ip: IP, salt: SALT, write: limited.write, verifyTurnstile }
    );

    expect(response).toEqual({ status: 429, body: { error: CHALLENGE_REQUIRED } });
    expect(limited.calls).toHaveLength(1);
    expect(verifyTurnstile).toHaveBeenCalledWith('not-a-pass');
  });

  it('writes again after a valid Turnstile token', async () => {
    const limited = harness((args) =>
      args.p_challenge_passed
        ? { ok: true, id: 'sig-passed' }
        : { ok: false, code: 'P0004', message: 'challenge_required' }
    );
    const verifyTurnstile = vi.fn(async (): Promise<TurnstileCheck> => 'valid');
    const response = await createSignature(
      { ...body, turnstileToken: 'token-from-widget' },
      { userId: 'u', ip: IP, salt: SALT, write: limited.write, verifyTurnstile }
    );

    expect(response).toEqual({
      status: 201,
      body: { signature_id: 'sig-passed' },
      boardId: body.studentId,
    });
    expect(limited.calls.map((call) => call.p_challenge_passed)).toEqual([false, true]);
    expect(JSON.stringify(limited.calls)).not.toContain('token-from-widget');
    expect(JSON.stringify(limited.calls)).not.toContain(IP);
  });

  it('does not treat a Turnstile outage as a passed challenge', async () => {
    const limited = harness({ ok: false, code: 'P0004', message: 'challenge_required' });
    const response = await createSignature(
      { ...body, turnstileToken: 'token-from-widget' },
      {
        userId: 'u',
        ip: IP,
        salt: SALT,
        write: limited.write,
        verifyTurnstile: async () => 'unavailable',
      }
    );

    expect(response).toEqual({ status: 503, body: { error: CHALLENGE_UNAVAILABLE } });
    expect(limited.calls).toHaveLength(1);
  });

  it('ignores a token when the board is still under the cap', async () => {
    const { calls, write } = harness({ ok: true, id: 'sig-1' });
    const verifyTurnstile = vi.fn(async (): Promise<TurnstileCheck> => 'invalid');
    const response = await createSignature(
      { ...body, turnstileToken: 'unused' },
      { userId: 'u', ip: IP, salt: SALT, write, verifyTurnstile }
    );

    expect(response.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0].p_challenge_passed).toBe(false);
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });
});
