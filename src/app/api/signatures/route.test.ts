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

import { POST } from './route';

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
