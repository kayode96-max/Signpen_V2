import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireRequestUser = vi.hoisted(() => vi.fn());
const createServiceClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/session', () => ({
  requireRequestUser,
}));

vi.mock('@/lib/server/supabase', () => ({
  createServiceClient,
}));

import { POST } from './route';
import { secondsUntilNextUtcDay } from '@/lib/server/sentiment';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UNAVAILABLE = 'summary_unavailable';
const QUOTA = 'summary_daily_limit';

function post() {
  return POST(
    new NextRequest('http://localhost/api/sentiment-summary', {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })
  );
}

function query(result: { data: unknown; error: { code?: string } | null }) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.order = self;
  builder.limit = self;
  builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve as never, reject as never);
  return builder;
}

function boardWithNotes(quota: { data: number | null; error: { code?: string } | null }) {
  createServiceClient.mockReturnValue({
    from(table: string) {
      if (table === 'students') return query({ data: { id: OWNER }, error: null });
      return query({ data: [{ signatoryNote: 'So proud of you' }], error: null });
    },
    rpc: vi.fn().mockResolvedValue(quota),
  });
}

describe('/api/sentiment-summary client errors', () => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');
    requireRequestUser.mockResolvedValue({
      ok: true,
      user: { id: OWNER, isAnonymous: false },
    });
  });

  it('hides a missing provider key behind the fixed 503 and logs the real reason', async () => {
    vi.stubEnv('GOOGLE_API_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: UNAVAILABLE });
    expect(response.headers.get('Retry-After')).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/GOOGLE_API_KEY|Couldn't|try again/i);
    expect(errorLog.mock.calls.flat().join(' ')).toContain('GOOGLE_API_KEY is not configured');
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('hides a provider failure behind the same 503', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'server-only-key');
    boardWithNotes({ data: 1, error: null });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('API key leaked-upstream-detail', { status: 500 })
    );

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: UNAVAILABLE });
    expect(JSON.stringify(body)).not.toMatch(/leaked-upstream-detail|server-only-key|Gemini|GOOGLE_API_KEY|Couldn't|try again/i);
    expect(errorLog.mock.calls.flat().join(' ')).toContain('provider request failed with status 500');
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('server-only-key');
    fetchSpy.mockRestore();
  });

  it('tells the owner when the board has used its 5 summaries today', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'server-only-key');
    boardWithNotes({ data: null, error: null });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: QUOTA });
    const retryAfter = Number(response.headers.get('Retry-After'));
    const remaining = secondsUntilNextUtcDay();
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(remaining);
    expect(retryAfter).toBeLessThanOrEqual(remaining + 2);
    expect(retryAfter).toBeLessThanOrEqual(86400);
    expect(JSON.stringify(body)).not.toMatch(/You've|tomorrow|summaries/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
