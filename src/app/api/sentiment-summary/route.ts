import { NextRequest, NextResponse } from 'next/server';
import { requireOwnBoard } from '@/lib/security/access';
import { firstZodError, sentimentRequestSchema } from '@/lib/security/schemas';
import { requireRequestUser } from '@/lib/server/session';
import {
  assertGeminiModel,
  buildSentimentPrompt,
  interpretSentimentQuota,
  notesFromRows,
  SENTIMENT_CALLS_PER_BOARD_PER_DAY,
} from '@/lib/server/sentiment';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Board owners only. Notes are loaded from that owner's signatures.
 * The request body cannot supply the text sent to Gemini.
 * Quota: SENTIMENT_CALLS_PER_BOARD_PER_DAY per board, reset at 00:00 UTC.
 * A call is counted before Gemini runs so a failing key cannot be retried without limit.
 */
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
  if (!session.ok) return session.response;

  const access = requireOwnBoard(session.user, parsed.data.studentId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_API_KEY is not configured on the server.' },
      { status: 503 }
    );
  }

  let model: string;
  try {
    model = assertGeminiModel(process.env.GEMINI_MODEL || 'gemini-2.5-flash');
  } catch {
    return NextResponse.json(
      { error: 'GEMINI_MODEL is not a supported model name.' },
      { status: 503 }
    );
  }

  try {
    const service = createServiceClient();
    const { data: student, error: studentError } = await service
      .from('students')
      .select('id')
      .eq('id', access.userId)
      .maybeSingle();

    if (studentError) {
      console.error('Failed to load board for sentiment:', studentError.code);
      return NextResponse.json({ error: 'Failed to load your board.' }, { status: 500 });
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
      console.error('Failed to load signature notes:', notesError.code);
      return NextResponse.json({ error: 'Failed to load signatures.' }, { status: 500 });
    }

    const prompt = buildSentimentPrompt(notesFromRows(rows ?? []));
    if (!prompt) {
      return NextResponse.json(
        { error: 'No signature notes to summarize.' },
        { status: 400 }
      );
    }

    const { data: used, error: quotaError } = await service.rpc('consume_sentiment_call', {
      p_student_id: access.userId,
    });

    if (quotaError) {
      console.error('Failed to record sentiment usage:', quotaError.code);
      return NextResponse.json(
        { error: 'Failed to record sentiment usage.' },
        { status: 500 }
      );
    }
    if (interpretSentimentQuota(typeof used === 'number' ? used : null) === 'exhausted') {
      return NextResponse.json(
        {
          error: `Sentiment summary is limited to ${SENTIMENT_CALLS_PER_BOARD_PER_DAY} calls per board per day.`,
        },
        { status: 429 }
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
      console.error('Gemini API call failed with status', response.status);
      return NextResponse.json(
        { error: 'Failed to generate sentiment summary from Google Gemini.' },
        { status: 502 }
      );
    }

    const payload = await response.json();
    const summary = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!summary) {
      return NextResponse.json(
        { error: 'Gemini returned an empty summary response.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ sentimentSummary: summary });
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('Error in sentiment summary handler.');
    return NextResponse.json(
      { error: 'Sentiment service is currently unavailable.' },
      { status: 502 }
    );
  }
}
