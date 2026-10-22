import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/security/ip-hash';
import { feedbackRequestSchema, firstZodError } from '@/lib/security/schemas';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';
import { verifyTurnstileToken } from '@/lib/server/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public feedback insert. The browser no longer writes the feedback table.
 * Email is stored on the base table and is not returned. The public wall
 * reads feedback_public (wired in the companion frontend PR).
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

  const verdict = await verifyTurnstileToken(
    parsed.data.turnstileToken,
    getClientIp(req.headers)
  );
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: verdict.status });
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from('feedback')
      .insert({
        name: parsed.data.name,
        email: parsed.data.email,
        message: parsed.data.message,
        type: parsed.data.type,
        rating: parsed.data.type === 'review' ? parsed.data.rating : null,
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      console.error('Failed to insert feedback:', error?.code ?? 'no id');
      return NextResponse.json({ error: 'Failed to save feedback.' }, { status: 500 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('Unexpected error in feedback handler.');
    return NextResponse.json({ error: 'Failed to save feedback.' }, { status: 500 });
  }
}
