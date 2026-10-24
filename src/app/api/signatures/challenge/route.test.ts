import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/supabase', () => ({
  createServiceClient,
}));

import { GET } from './route';

const STUDENT = '11111111-1111-4111-8111-111111111111';
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
    rpc.mockResolvedValue({ data: true, error: null });
    createServiceClient.mockReturnValue({ rpc });
  });

  it('returns only the boolean and never echoes the address', async () => {
    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cache-control')).not.toMatch(/s-maxage/i);
    expect(body).toEqual({ challenge_required: true });
    expect(Object.keys(body)).toEqual(['challenge_required']);
    expect(JSON.stringify(body)).not.toContain(IP);
    expect(rpc).toHaveBeenCalledWith('signature_challenge_required', {
      p_student_id: STUDENT,
      p_ip: IP,
    });
  });

  it('reports when the hourly cap has not been reached', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge_required: false });
  });

  it('rejects a missing or non-uuid board id', async () => {
    const bad = await get('not-a-uuid');
    expect(bad.status).toBe(400);
    expect(bad.headers.get('cache-control')).toBe('private, no-store');
    expect((await get(null)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not answer when the visitor IP is missing', async () => {
    expect((await get(STUDENT, null)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 500 without leaking details when the lookup fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    const response = await get();
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cache-control')).not.toMatch(/s-maxage/i);
    expect(JSON.stringify(await response.json())).not.toMatch(/42501|permission|203\.0\.113/);
  });
});
