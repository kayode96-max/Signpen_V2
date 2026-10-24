import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { boardCacheTag } from '@/lib/cache/board';
import { getClientIp } from '@/lib/security/client-ip';
import { createSignature, type SignatureWriteArgs, type TurnstileCheck } from '@/lib/server/signatures';
import { requireRequestUser } from '@/lib/server/session';
import { privateNoStore } from '@/lib/server/private-no-store';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';
import { verifyTurnstileToken } from '@/lib/server/turnstile';

export const runtime = 'nodejs';
// Varies by Authorization. Never statically generated, ISR-cached, or shared via s-maxage.
export const dynamic = 'force-dynamic';

const studentIdSchema = z.string().uuid();

/**
 * GET /api/signatures?studentId=... -> { alreadySigned } for the caller's session.
 * The rule is one signature per device session per board (signature_signers),
 * not one per IP, so people on shared Wi-Fi can each sign. Without a session
 * header the answer is false: a visitor without a session has not signed.
 * Every status is private and uncached: the answer depends on Authorization.
 */
export async function GET(req: NextRequest) {
  const parsed = studentIdSchema.safeParse(req.nextUrl.searchParams.get('studentId'));
  if (!parsed.success) {
    return privateNoStore(NextResponse.json({ error: 'studentId must be a UUID.' }, { status: 400 }));
  }
  if (!(req.headers.get('authorization') ?? '').startsWith('Bearer ')) {
    return privateNoStore(NextResponse.json({ alreadySigned: false }));
  }

  const session = await requireRequestUser(req);
  if (!session.ok) return privateNoStore(session.response);

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('signer_has_signed', {
      p_student_id: parsed.data,
      p_signer_user_id: session.user.id,
    });
    if (error || typeof data !== 'boolean') {
      console.error('signer_has_signed failed:', error?.code ?? 'no boolean');
      return privateNoStore(NextResponse.json({ error: 'Failed to verify signing history.' }, { status: 500 }));
    }
    return privateNoStore(NextResponse.json({ alreadySigned: data }));
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return privateNoStore(NextResponse.json({ error: err.message }, { status: 503 }));
    }
    console.error('Unexpected error in signatures GET handler.');
    return privateNoStore(NextResponse.json({ error: 'Failed to verify signing history.' }, { status: 500 }));
  }
}

/**
 * Anonymous sessions may sign. Inserts run as the service role through
 * public.insert_signature. That function allows 100 signatures per hashed IP
 * per board per rolling hour and then raises challenge_required. A verified
 * Turnstile token is the only way past that cap. There is no cross-board cap.
 * The raw IP is passed to insert_signature, which stores only a salted SHA-256
 * (private.hash_ip). The salt never leaves the database.
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
    if (result.status === 201 && result.boardId) {
      revalidateTag(boardCacheTag(result.boardId));
    }
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
