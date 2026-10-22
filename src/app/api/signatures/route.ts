import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/security/ip-hash';
import { createSignature, type SignatureWriteArgs } from '@/lib/server/signatures';
import { requireRequestUser } from '@/lib/server/session';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Anonymous sessions may sign. Inserts run as the service role through
 * public.insert_signature, which also enforces one signature per session
 * and the hashed-IP rate limit. The raw IP is hashed here and discarded.
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
