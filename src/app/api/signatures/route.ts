import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/security/ip-hash';
import { createSignature, type SignatureWriteArgs, type TurnstileCheck } from '@/lib/server/signatures';
import { requireRequestUser } from '@/lib/server/session';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';
import { verifyTurnstileToken } from '@/lib/server/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Anonymous sessions may sign. Inserts run as the service role through
 * public.insert_signature. That function allows 100 signatures per hashed IP
 * per board per rolling hour and then raises challenge_required. A verified
 * Turnstile token is the only way past that cap. There is no cross-board cap.
 * The raw IP is hashed here and discarded.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const session = await requireRequestUser(req);
  if (!session.ok) return session.response;

  try {
    const service = createServiceClient();
    const result = await createSignature(raw, {
      userId: session.user.id,
      ip: getClientIp(req.headers),
      salt: process.env.IP_HASH_SALT,
      verifyTurnstile: (token) => checkTurnstile(token, getClientIp(req.headers)),
      write: async (args: SignatureWriteArgs) => {
        const { data, error } = await service.rpc('insert_signature', args);
        if (error) return { ok: false as const, code: error.code, message: error.message };
        if (typeof data !== 'string' || data.length === 0) {
          return { ok: false as const, message: 'insert_signature returned no id' };
        }
        return { ok: true as const, id: data };
      },
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('Unexpected error in signatures handler.');
    return NextResponse.json(
      { error: 'Internal server error while processing signature.' },
      { status: 500 }
    );
  }
}

async function checkTurnstile(token: string, ip: string | null): Promise<TurnstileCheck> {
  const verdict = await verifyTurnstileToken(token, ip);
  if (verdict.ok) return 'valid';
  if (verdict.status === 400) return 'invalid';
  console.error('signature challenge verification failed:', verdict.error);
  return 'unavailable';
}
