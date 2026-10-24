import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/lib/security/client-ip';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const studentIdSchema = z.string().uuid();

/**
 * Tells the signing page whether this IP must solve Turnstile before drawing.
 * The body is only { challenge_required }. The count and the hashed IP stay
 * in Postgres (signature_challenge_required hashes the address itself).
 */
export async function GET(req: NextRequest) {
  const parsed = studentIdSchema.safeParse(req.nextUrl.searchParams.get('studentId'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'studentId must be a UUID.' }, { status: 400 });
  }

  const ip = getClientIp(req.headers);
  if (!ip) {
    return NextResponse.json(
      { error: 'Could not determine a client IP for rate limiting.' },
      { status: 400 }
    );
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('signature_challenge_required', {
      p_student_id: parsed.data,
      p_ip: ip,
    });
    if (error || typeof data !== 'boolean') {
      console.error('signature challenge lookup failed:', error?.code ?? 'no boolean');
      return NextResponse.json({ error: 'Could not check the signature limit.' }, { status: 500 });
    }
    return NextResponse.json({ challenge_required: data });
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('Unexpected error in signature challenge handler.');
    return NextResponse.json({ error: 'Could not check the signature limit.' }, { status: 500 });
  }
}
