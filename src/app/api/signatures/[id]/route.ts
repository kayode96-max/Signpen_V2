import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { boardCacheTag } from '@/lib/cache/board';
import { firstZodError, signaturePatchSchema } from '@/lib/security/schemas';
import {
  canDeleteSignature,
  decideSignaturePatch,
  signatureActor,
} from '@/lib/security/signature-access';
import { requireRequestUser } from '@/lib/server/session';
import {
  createServiceClient,
  createUserClient,
  MissingServerConfigError,
} from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const signatureIdSchema = z.string().uuid('Signature id must be a UUID.');

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Edits and deletes run as the caller's JWT, so the signatures policies and
 * tg_signatures_guard still apply. The service role only reads id and
 * studentId, which distinguishes a missing row (404) from a row the caller
 * cannot change (403) without writing past RLS.
 * signer_can_modify is signer_owns plus the 24 hour window.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = signaturePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const loaded = await loadSignature(req, context);
  if (!loaded.ok) return loaded.response;

  const decision = decideSignaturePatch(loaded.actor, parsed.data);
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  const { data, error } = await loaded.userClient
    .from('signatures')
    .update(decision.changes)
    .eq('id', loaded.id)
    .select('id');

  if (error) return writeError(error.message);
  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: 'You cannot change this signature.' }, { status: 403 });
  }

  revalidateTag(boardCacheTag(loaded.studentId));
  return NextResponse.json({ id: loaded.id });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const loaded = await loadSignature(req, context);
  if (!loaded.ok) return loaded.response;
  if (!canDeleteSignature(loaded.actor)) {
    return NextResponse.json({ error: 'You cannot change this signature.' }, { status: 403 });
  }

  const { data, error } = await loaded.userClient
    .from('signatures')
    .delete()
    .eq('id', loaded.id)
    .select('id');

  if (error) return writeError(error.message);
  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: 'You cannot change this signature.' }, { status: 403 });
  }

  revalidateTag(boardCacheTag(loaded.studentId));
  return NextResponse.json({ id: loaded.id });
}

type LoadResult =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      id: string;
      studentId: string;
      actor: ReturnType<typeof signatureActor>;
      userClient: ReturnType<typeof createUserClient>;
    };

async function loadSignature(req: NextRequest, context: RouteContext): Promise<LoadResult> {
  const { id: rawId } = await context.params;
  const idParsed = signatureIdSchema.safeParse(rawId);
  if (!idParsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: firstZodError(idParsed.error) }, { status: 400 }),
    };
  }

  const session = await requireRequestUser(req);
  if (!session.ok) return { ok: false, response: session.response };

  const token = bearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Session authorization header is missing.' },
        { status: 401 }
      ),
    };
  }

  try {
    const service = createServiceClient();
    const { data: row, error: lookupError } = await service
      .from('signatures')
      .select('id, studentId')
      .eq('id', idParsed.data)
      .maybeSingle();

    if (lookupError) {
      console.error('signature lookup failed:', lookupError.code ?? 'unknown');
      return {
        ok: false,
        response: NextResponse.json({ error: 'Failed to load signature.' }, { status: 500 }),
      };
    }
    if (!row?.id || typeof row.studentId !== 'string') {
      return {
        ok: false,
        response: NextResponse.json({ error: 'This signature does not exist.' }, { status: 404 }),
      };
    }

    const userClient = createUserClient(token);
    const { data: canModify, error: signerError } = await userClient.rpc('signer_can_modify', {
      p_signature_id: idParsed.data,
    });
    if (signerError) {
      console.error('signer_can_modify failed:', signerError.code ?? 'unknown');
      return {
        ok: false,
        response: NextResponse.json({ error: 'Failed to load signature.' }, { status: 500 }),
      };
    }

    return {
      ok: true,
      id: idParsed.data,
      studentId: row.studentId,
      actor: signatureActor({
        user: session.user,
        studentId: row.studentId,
        signerCanModify: canModify === true,
      }),
      userClient,
    };
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return {
        ok: false,
        response: NextResponse.json({ error: err.message }, { status: 503 }),
      };
    }
    console.error('Unexpected error while loading a signature.');
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to load signature.' }, { status: 500 }),
    };
  }
}

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function writeError(message: string) {
  if (
    message.includes('only the signer') ||
    message.includes('only the board owner') ||
    message.includes('not allowed') ||
    message.includes('immutable')
  ) {
    return NextResponse.json({ error: 'You cannot change this signature.' }, { status: 403 });
  }
  console.error('signature write failed');
  return NextResponse.json({ error: 'Failed to update signature.' }, { status: 500 });
}
