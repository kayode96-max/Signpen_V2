import { NextRequest, NextResponse } from 'next/server';
import { requireOwnBoard } from '@/lib/security/access';
import { firstZodError, sentimentRequestSchema } from '@/lib/security/schemas';
import { requireRequestUser } from '@/lib/server/session';
import {
  assertGeminiModel,
  buildSentimentPrompt,
  interpretSentimentQuota,
  notesFromRows,
  secondsUntilNextUtcDay,
  sentimentQuotaOpen,
  SENTIMENT_QUOTA_ERROR,
  SENTIMENT_UNAVAILABLE_ERROR,
} from '@/lib/server/sentiment';
import { createServiceClient } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Board owners only. Notes are loaded from that owner's signatures.
 * The request body cannot supply the text sent to Gemini.
 * Quota: 5 successful summaries per board per UTC day. The count is read
 * first and incremented only after Gemini returns a summary, so a 503 does
 * not consume a slot. consume_sentiment_call stops the counter at 5.
 * Provider and config failures are logged here and returned as summary_unavailable.
 * The daily cap is summary_daily_limit plus Retry-After until the next UTC midnight.
 * Neither body contains user-facing copy.
 */
function unavailable(detail: string) {
  const secret = process.env.GOOGLE_API_KEY;
  const safe = secret ? detail.split(secret).join('[redacted]') : detail;
  console.error('sentiment-summary:', safe);
  return NextResponse.json({ error: SENTIMENT_UNAVAILABLE_ERROR }, { status: 503 });
}

export async function POST(req: NextRequest) {
  let raw: unknown = {};
  const text = await req.text();
  if (text.trim().length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }
  }

  const parsed = sentimentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const session = await requireRequestUser(req);
  if (!session.ok) {
    if (session.response.status === 503) {
      return unavailable('session client is not configured');
    }
    return session.response;
  }

  const access = requireOwnBoard(session.user, parsed.data.studentId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return unavailable('GOOGLE_API_KEY is not configured');
  }

  let model: string;
  try {
    model = assertGeminiModel(process.env.GEMINI_MODEL || 'gemini-2.5-flash');
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'GEMINI_MODEL is invalid';
    return unavailable(detail);
  }

  try {
    const service = createServiceClient();
    const { data: student, error: studentError } = await service
      .from('students')
      .select('id')
      .eq('id', access.userId)
      .maybeSingle();

    if (studentError) {
      return unavailable(`failed to load board (${studentError.code ?? 'unknown'})`);
    }
    if (!student) {
      return NextResponse.json({ error: 'This board does not exist.' }, { status: 404 });
    }

    const { data: rows, error: notesError } = await service
      .from('signatures')
      .select('signatoryNote')
      .eq('studentId', access.userId)
      .order('timestamp', { ascending: false })
      .limit(200);

    if (notesError) {
      return unavailable(`failed to load signature notes (${notesError.code ?? 'unknown'})`);
    }

    const prompt = buildSentimentPrompt(notesFromRows(rows ?? []));
    if (!prompt) {
      return NextResponse.json(
        { error: 'No signature notes to summarize.' },
        { status: 400 }
      );
    }

    const { data: usedToday, error: usageError } = await service.rpc('sentiment_usage_today', {
      p_student_id: access.userId,
    });
    if (usageError) {
      return unavailable(`failed to read sentiment usage (${usageError.code ?? 'unknown'})`);
    }
    if (!sentimentQuotaOpen(typeof usedToday === 'number' ? usedToday : null)) {
      return NextResponse.json(
        { error: SENTIMENT_QUOTA_ERROR },
        { status: 429, headers: { 'Retry-After': String(secondsUntilNextUtcDay()) } }
      );
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return unavailable(`provider request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const summary = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!summary) {
      return unavailable('provider returned an empty summary');
    }

    const { data: used, error: quotaError } = await service.rpc('consume_sentiment_call', {
      p_student_id: access.userId,
    });
    if (quotaError) {
      return unavailable(`failed to record sentiment usage (${quotaError.code ?? 'unknown'})`);
    }
    if (interpretSentimentQuota(typeof used === 'number' ? used : null) === 'exhausted') {
      return NextResponse.json(
        { error: SENTIMENT_QUOTA_ERROR },
        { status: 429, headers: { 'Retry-After': String(secondsUntilNextUtcDay()) } }
      );
    }

    return NextResponse.json({ sentimentSummary: summary });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unexpected handler error';
    return unavailable(detail);
  }
}
