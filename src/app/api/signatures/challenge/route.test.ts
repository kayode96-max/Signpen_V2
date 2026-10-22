import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashIp } from '@/lib/security/ip-hash';

const createServiceClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/supabase', () => ({
  createServiceClient,
}));

import { GET } from './route';

const STUDENT = '11111111-1111-4111-8111-111111111111';
const SALT = 'preview-salt-value-01';
const IP = '203.0.113.44';

function get(studentId: string | null = STUDENT, ip: string | null = IP) {
  const url = new URL('http://localhost/api/signatures/challenge');
  if (studentId !== null) url.searchParams.set('studentId', studentId);
  const headers = new Headers();
  if (ip) headers.set('x-forwarded-for', ip);
  return GET(new NextRequest(url, { headers }));
}

describe('GET /api/signatures/challenge', () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('IP_HASH_SALT', SALT);
    rpc.mockResolvedValue({ data: true, error: null });
    createServiceClient.mockReturnValue({ rpc });
  });

  it('returns only the boolean and sends the hash, not the address', async () => {
    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ challenge_required: true });
    expect(Object.keys(body)).toEqual(['challenge_required']);
    expect(JSON.stringify(body)).not.toContain(IP);
    expect(rpc).toHaveBeenCalledWith('signature_challenge_required', {
      p_student_id: STUDENT,
      p_ip_hash: hashIp(IP, SALT),
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(IP);
  });

  it('reports when the hourly cap has not been reached', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge_required: false });
  });

  it('rejects a missing or non-uuid board id', async () => {
    expect((await get('not-a-uuid')).status).toBe(400);
    expect((await get(null)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not answer when the visitor IP or the salt is missing', async () => {
    expect((await get(STUDENT, null)).status).toBe(400);
    vi.stubEnv('IP_HASH_SALT', '');
    expect((await get()).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});
