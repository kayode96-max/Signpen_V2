import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashIp } from '@/lib/security/ip-hash';

const verifyTurnstileToken = vi.hoisted(() => vi.fn());
const createServiceClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/turnstile', () => ({
  verifyTurnstileToken,
}));

vi.mock('@/lib/server/supabase', () => ({
  createServiceClient,
}));

import { POST } from './route';

const SALT = 'preview-salt-value-01';
const IP = '203.0.113.44';

const payload = {
  name: 'Mary Jane',
  email: 'mary@example.com',
  message: 'Loved the shirt.',
  type: 'comment',
  turnstileToken: 'token-from-widget',
};

function post() {
  return POST(
    new NextRequest('http://localhost/api/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': IP,
      },
      body: JSON.stringify(payload),
    })
  );
}

describe('POST /api/feedback', () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('IP_HASH_SALT', SALT);
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    verifyTurnstileToken.mockResolvedValue({ ok: true });
    rpc.mockResolvedValue({ data: { limited: false, id: 'fb-1' }, error: null });
    createServiceClient.mockReturnValue({ rpc });
  });

  it('saves feedback after Turnstile and stores a hash, not the address', async () => {
    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'fb-1' });
    expect(verifyTurnstileToken).toHaveBeenCalledWith('token-from-widget', IP);
    expect(rpc).toHaveBeenCalledWith('insert_feedback', expect.objectContaining({
      p_email: 'mary@example.com',
      p_ip_hash: hashIp(IP, SALT),
      p_rating: null,
    }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(IP);
  });

  it('does not write when Turnstile fails', async () => {
    verifyTurnstileToken.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'Turnstile verification failed. Please try again.',
    });
    const response = await post();
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns feedback_rate_limited and Retry-After past 5 posts an hour', async () => {
    rpc.mockResolvedValue({ data: { limited: true, retry_after: 120.2 }, error: null });
    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: 'feedback_rate_limited' });
    expect(response.headers.get('Retry-After')).toBe('121');
    expect(Object.keys(body)).toEqual(['error']);
    expect(JSON.stringify(body)).not.toMatch(/120|count|ipHash|203\.0\.113/);
  });
});
