import { describe, expect, it } from 'vitest';
import { createSignature, mapSignatureWriteError, type SignatureWriteArgs } from '@/lib/server/signatures';

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

function harness(result: { ok: true; id: string } | { ok: false; code?: string; message?: string }) {
  const calls: SignatureWriteArgs[] = [];
  const write = async (args: SignatureWriteArgs) => {
    calls.push(args);
    return result;
  };
  return { calls, write };
}

describe('mapSignatureWriteError', () => {
  it('maps the database outcomes to 404, 409, 429, and 400', () => {
    expect(mapSignatureWriteError({ code: 'P0002', message: 'board_not_found' }).status).toBe(404);
    expect(mapSignatureWriteError({ code: '23503', message: 'foreign key' }).status).toBe(404);
    expect(mapSignatureWriteError({ code: 'P0004', message: 'rate_limited' }).status).toBe(429);
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

    expect(response).toEqual({ status: 201, body: { signature_id: 'sig-1' } });
    expect(calls).toHaveLength(1);
    const args = calls[0];
    expect(args.p_signer_user_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(args.p_private).toBe(true);
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

  it('returns 404, 409, and 429 from the write without hiding the failure', async () => {
    const missing = harness({ ok: false, code: 'P0002', message: 'board_not_found' });
    expect((await createSignature(body, { userId: 'u', ip: IP, salt: SALT, write: missing.write })).status).toBe(404);

    const duplicate = harness({ ok: false, code: '23505', message: 'already_signed' });
    expect((await createSignature(body, { userId: 'u', ip: IP, salt: SALT, write: duplicate.write })).status).toBe(409);

    const limited = harness({ ok: false, code: 'P0004', message: 'rate_limited' });
    const limitedResponse = await createSignature(body, {
      userId: 'u',
      ip: IP,
      salt: SALT,
      write: limited.write,
    });
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body.error).toMatch(/Too many signatures/);
  });
});
