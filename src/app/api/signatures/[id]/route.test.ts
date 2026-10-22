import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireRequestUser = vi.hoisted(() => vi.fn());
const createServiceClient = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidateTag }));
vi.mock('@/lib/server/session', () => ({ requireRequestUser }));
vi.mock('@/lib/server/supabase', () => ({
  createServiceClient,
  MissingServerConfigError: class MissingServerConfigError extends Error {},
}));

import { DELETE, PATCH } from './route';

const SIG = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIGNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function request(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/signatures/${SIG}`, {
    method,
    headers: {
      authorization: 'Bearer session-token',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function call(method: 'PATCH' | 'DELETE', body?: unknown, id = SIG) {
  const handler = method === 'PATCH' ? PATCH : DELETE;
  return handler(request(method, body), { params: Promise.resolve({ id }) });
}

describe('/api/signatures/[id]', () => {
  const rpc = vi.fn();
  let signerCanModify = false;
  let writeResult: string = 'ok';
  let row: { id: string; studentId: string } | null = { id: SIG, studentId: OWNER };

  beforeEach(() => {
    vi.clearAllMocks();
    signerCanModify = false;
    writeResult = 'ok';
    row = { id: SIG, studentId: OWNER };
    requireRequestUser.mockResolvedValue({
      ok: true,
      user: { id: STRANGER, isAnonymous: false },
    });

    rpc.mockImplementation((name: string) => {
      if (name === 'signer_can_modify') {
        return Promise.resolve({ data: signerCanModify, error: null });
      }
      return Promise.resolve({ data: writeResult, error: null });
    });
    createServiceClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
        update: () => {
          throw new Error('authenticated update must not run');
        },
        delete: () => {
          throw new Error('authenticated delete must not run');
        },
      }),
      rpc,
    });
  });

  function asUser(id: string, isAnonymous = false, canModify = false) {
    signerCanModify = canModify;
    requireRequestUser.mockResolvedValue({ ok: true, user: { id, isAnonymous } });
  }

  function writeCalls() {
    return rpc.mock.calls.filter((call) => call[0] !== 'signer_can_modify');
  }

  it('lets the owner hide a signature and invalidates that board', async () => {
    asUser(OWNER, false, false);
    const response = await call('PATCH', { hidden_by_owner: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: SIG });
    expect(rpc).toHaveBeenCalledWith('owner_set_signature_hidden', {
      p_actor: OWNER,
      p_signature_id: SIG,
      p_hidden: true,
    });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(`board:${OWNER}`);
  });

  it('refuses an owner who tries to change the note', async () => {
    asUser(OWNER);
    const response = await call('PATCH', { signatoryNote: 'Changed' });
    expect(response.status).toBe(403);
    expect(writeCalls()).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('refuses an anonymous session that matches the board id', async () => {
    asUser(OWNER, true, false);
    const response = await call('PATCH', { hidden_by_owner: true });
    expect(response.status).toBe(403);
    expect(writeCalls()).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('lets the signer edit within the window and invalidates the board', async () => {
    asUser(SIGNER, true, true);
    const response = await call('PATCH', {
      signatoryName: 'Ada',
      privateBySigner: true,
      position: { x: 12.5, y: 40 },
    });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('signer_update_signature', {
      p_actor: SIGNER,
      p_signature_id: SIG,
      p_name: 'Ada',
      p_note: null,
      p_image: null,
      p_position: { x: 12.5, y: 40 },
      p_private: true,
    });
    expect(revalidateTag).toHaveBeenCalledWith(`board:${OWNER}`);
  });

  it('refuses a signer who tries to set hidden_by_owner', async () => {
    asUser(SIGNER, true, true);
    const response = await call('PATCH', { hidden_by_owner: true });
    expect(response.status).toBe(403);
    expect(writeCalls()).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('returns 403 for anyone else and 404 when the signature is missing', async () => {
    asUser(STRANGER, false, false);
    const forbidden = await call('PATCH', { signatoryName: 'Ada' });
    expect(forbidden.status).toBe(403);
    expect(writeCalls()).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();

    row = null;
    const missing = await call('DELETE');
    expect(missing.status).toBe(404);
    expect(writeCalls()).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('lets the owner or the signer delete, and invalidates the board once', async () => {
    asUser(OWNER);
    const byOwner = await call('DELETE');
    expect(byOwner.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('delete_signature', {
      p_actor: OWNER,
      p_signature_id: SIG,
    });
    expect(revalidateTag).toHaveBeenCalledWith(`board:${OWNER}`);

    revalidateTag.mockClear();
    rpc.mockClear();
    asUser(SIGNER, true, true);
    const bySigner = await call('DELETE');
    expect(bySigner.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('delete_signature', {
      p_actor: SIGNER,
      p_signature_id: SIG,
    });
    expect(revalidateTag).toHaveBeenCalledWith(`board:${OWNER}`);

    revalidateTag.mockClear();
    rpc.mockClear();
    asUser(STRANGER);
    const refused = await call('DELETE');
    expect(refused.status).toBe(403);
    expect(writeCalls()).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('maps forbidden and not_found from the database and does not invalidate', async () => {
    asUser(OWNER);
    writeResult = 'forbidden';
    const forbidden = await call('PATCH', { hidden_by_owner: false });
    expect(forbidden.status).toBe(403);
    expect(revalidateTag).not.toHaveBeenCalled();

    writeResult = 'not_found';
    const missing = await call('DELETE');
    expect(missing.status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('does not invalidate the cache for a bad id or a bad body', async () => {
    const badId = await call('PATCH', { hidden_by_owner: true }, 'not-a-uuid');
    expect(badId.status).toBe(400);
    const badBody = await call('PATCH', { signerUserId: OWNER });
    expect(badBody.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});
