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

function boardWithNotes(handlers?: {
  usage?: number | null;
  consume?: number | null;
  consumeError?: { code?: string } | null;
  usageError?: { code?: string } | null;
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'sentiment_usage_today') {
      return { data: handlers?.usage ?? 0, error: handlers?.usageError ?? null };
    }
    if (name === 'consume_sentiment_call') {
      return {
        data: handlers && 'consume' in handlers ? handlers.consume : 1,
        error: handlers?.consumeError ?? null,
      };
    }
    return { data: null, error: { code: 'unexpected' } };
  });
  createServiceClient.mockReturnValue({
    from(table: string) {
      if (table === 'students') return query({ data: { id: OWNER }, error: null });
      return query({ data: [{ signatoryNote: 'So proud of you' }], error: null });
    },
    rpc,
  });
  return rpc;
}

function summaryResponse(text: string) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
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

  it('hides a provider failure behind the same 503 and does not spend a slot', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'server-only-key');
    const rpc = boardWithNotes({ usage: 1 });
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
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(['sentiment_usage_today']);
    fetchSpy.mockRestore();
  });

  it('counts a slot only after Gemini returns a summary', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'server-only-key');
    const rpc = boardWithNotes({ usage: 4, consume: 5 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(summaryResponse('Warm and proud.'));

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ sentimentSummary: 'Warm and proud.' });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'sentiment_usage_today',
      'consume_sentiment_call',
    ]);
    const consumeOrder = rpc.mock.invocationCallOrder[1];
    const fetchOrder = fetchSpy.mock.invocationCallOrder[0];
    expect(fetchOrder).toBeLessThan(consumeOrder);
    fetchSpy.mockRestore();
  });

  it('tells the owner when the board has used its 5 summaries today', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'server-only-key');
    const rpc = boardWithNotes({ usage: 5 });
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
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(['sentiment_usage_today']);
    fetchSpy.mockRestore();
  });

  it('does not return a sixth summary when a concurrent call takes the last slot', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'server-only-key');
    const rpc = boardWithNotes({ usage: 4, consume: null });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(summaryResponse('Too late.'));

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: QUOTA });
    expect(JSON.stringify(body)).not.toContain('Too late.');
    expect(rpc.mock.calls.map((call) => call[0])).toContain('consume_sentiment_call');
    fetchSpy.mockRestore();
  });
});
