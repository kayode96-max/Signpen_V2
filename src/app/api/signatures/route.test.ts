import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireRequestUser = vi.hoisted(() => vi.fn());
const createServiceClient = vi.hoisted(() => vi.fn());
const createSignature = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidateTag }));
vi.mock('@/lib/server/session', () => ({ requireRequestUser }));
vi.mock('@/lib/server/supabase', () => ({
  createServiceClient,
  MissingServerConfigError: class MissingServerConfigError extends Error {},
}));
vi.mock('@/lib/server/signatures', () => ({ createSignature }));

import { GET, POST } from './route';

const BOARD = '11111111-1111-4111-8111-111111111111';

describe('POST /api/signatures cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isAnonymous: true },
    });
    createServiceClient.mockReturnValue({});
  });

  function post() {
    return POST(
      new NextRequest('http://localhost/api/signatures', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.44',
        },
        body: JSON.stringify({ studentId: BOARD }),
      })
    );
  }

  it('invalidates the board tag after a successful insert', async () => {
    createSignature.mockResolvedValue({
      status: 201,
      body: { signature_id: 'sig-1' },
      boardId: BOARD,
    });

    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ signature_id: 'sig-1' });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(`board:${BOARD}`);
  });

  it('does not invalidate the board when the insert is refused', async () => {
    createSignature.mockResolvedValue({
      status: 429,
      body: { error: 'challenge_required' },
    });

    const response = await post();
    expect(response.status).toBe(429);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe('GET /api/signatures (already signed from this device session)', () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    requireRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isAnonymous: true },
    });
    rpc.mockResolvedValue({ data: true, error: null });
    createServiceClient.mockReturnValue({ rpc });
  });

  function get(studentId: string, auth = true) {
    const url = new URL('http://localhost/api/signatures');
    url.searchParams.set('studentId', studentId);
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.44' });
    if (auth) headers.set('authorization', 'Bearer token');
    return GET(new NextRequest(url, { headers }));
  }

  it('checks the session, not the IP, so shared Wi-Fi does not block', async () => {
    const response = await get(BOARD);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ alreadySigned: true });
    expect(rpc).toHaveBeenCalledWith('signer_has_signed', {
      p_student_id: BOARD,
      p_signer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('203.0.113.44');
  });

  it('answers false without a session and never queries', async () => {
    const response = await get(BOARD, false);
    expect(await response.json()).toEqual({ alreadySigned: false });
    expect(requireRequestUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid board and hides lookup errors', async () => {
    expect((await get('nope')).status).toBe(400);
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    const failed = await get(BOARD);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toMatch(/42501|permission/);
  });
});
