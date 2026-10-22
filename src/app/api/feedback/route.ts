import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIp } from '@/lib/security/ip-hash';
import { IP_HASH_SALT_MIN } from '@/lib/security/limits';
import { feedbackRequestSchema, firstZodError } from '@/lib/security/schemas';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';
import { verifyTurnstileToken } from '@/lib/server/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public feedback insert. Turnstile runs first. insert_feedback then allows
 * 5 posts per hashed IP per rolling hour and returns retry_after when the
 * cap is already used. The raw IP is hashed here and discarded. Email stays
 * on the base table. The public wall reads feedback_public.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = feedbackRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const ip = getClientIp(req.headers);
  const verdict = await verifyTurnstileToken(parsed.data.turnstileToken, ip);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: verdict.status });
  }

  if (!ip) {
    return NextResponse.json(
      { error: 'Could not determine a client IP for rate limiting.' },
      { status: 400 }
    );
  }

  const salt = process.env.IP_HASH_SALT;
  if (!salt || salt.trim().length < IP_HASH_SALT_MIN) {
    return NextResponse.json(
      { error: 'IP_HASH_SALT is not configured on the server.' },
      { status: 503 }
    );
  }

  let ipHash: string;
  try {
    ipHash = hashIp(ip, salt);
  } catch {
    return NextResponse.json(
      { error: 'IP_HASH_SALT is not configured on the server.' },
      { status: 503 }
    );
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('insert_feedback', {
      p_name: parsed.data.name,
      p_email: parsed.data.email,
      p_message: parsed.data.message,
      p_type: parsed.data.type,
      p_rating: parsed.data.type === 'review' ? parsed.data.rating : null,
      p_ip_hash: ipHash,
    });

    if (error) {
      console.error('Failed to insert feedback:', error.code ?? 'rpc');
      return NextResponse.json({ error: 'Failed to save feedback.' }, { status: 500 });
    }

    const result = readFeedbackResult(data);
    if (!result) {
      console.error('insert_feedback returned an unreadable result');
      return NextResponse.json({ error: 'Failed to save feedback.' }, { status: 500 });
    }
    if (result.limited) {
      return NextResponse.json(
        { error: 'feedback_rate_limited' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
      );
    }

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('Unexpected error in feedback handler.');
    return NextResponse.json({ error: 'Failed to save feedback.' }, { status: 500 });
  }
}

function readFeedbackResult(
  data: unknown
): { limited: true; retryAfter: number } | { limited: false; id: string } | null {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as { limited?: unknown; retry_after?: unknown; id?: unknown };
  if (row.limited === true) {
    const retry = Number(row.retry_after);
    const retryAfter = Number.isFinite(retry) ? Math.max(1, Math.ceil(retry)) : 1;
    return { limited: true, retryAfter };
  }
  if (typeof row.id === 'string' && row.id.length > 0) {
    return { limited: false, id: row.id };
  }
  return null;
}
