import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { boardCacheTag } from '@/lib/cache/board';
import { firstZodError, signaturePatchSchema } from '@/lib/security/schemas';
import {
  canDeleteSignature,
  decideSignaturePatch,
  signatureActor,
  type SignaturePatchInput,
} from '@/lib/security/signature-access';
import { requireRequestUser } from '@/lib/server/session';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const signatureIdSchema = z.string().uuid('Signature id must be a UUID.');

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The browser cannot update or delete signatures. These routes verify the
 * JWT, take the actor id from that token, and call service-role functions
 * that re-check the owner and the 24 hour signer inside the database.
 * A successful write invalidates board:${studentId}.
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

  const rpc =
    loaded.actor === 'owner'
      ? {
          name: 'owner_set_signature_hidden',
          args: {
            p_actor: loaded.actorId,
            p_signature_id: loaded.id,
            p_hidden: decision.changes.hidden_by_owner,
          },
        }
      : {
          name: 'signer_update_signature',
          args: signerArgs(loaded.actorId, loaded.id, parsed.data),
        };

  const result = await callWrite(loaded.service, rpc.name, rpc.args);
  if (!result.ok) return result.response;

  revalidateTag(boardCacheTag(loaded.studentId));
  return NextResponse.json({ id: loaded.id });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const loaded = await loadSignature(req, context);
  if (!loaded.ok) return loaded.response;
  if (!canDeleteSignature(loaded.actor)) {
    return NextResponse.json({ error: 'You cannot change this signature.' }, { status: 403 });
  }

  const result = await callWrite(loaded.service, 'delete_signature', {
    p_actor: loaded.actorId,
    p_signature_id: loaded.id,
  });
  if (!result.ok) return result.response;

  revalidateTag(boardCacheTag(loaded.studentId));
  return NextResponse.json({ id: loaded.id });
}

function signerArgs(actorId: string, signatureId: string, body: SignaturePatchInput) {
  return {
    p_actor: actorId,
    p_signature_id: signatureId,
    p_name: body.signatoryName ?? null,
    p_note: body.signatoryNote ?? null,
    p_image: body.signatureImageUrl ?? null,
    p_position: body.position ?? null,
    p_private: body.privateBySigner ?? null,
  };
}

type LoadResult =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      id: string;
      studentId: string;
      actorId: string;
      actor: ReturnType<typeof signatureActor>;
      service: ReturnType<typeof createServiceClient>;
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

    const { data: canModify, error: signerError } = await service.rpc('signer_can_modify', {
      p_signature_id: idParsed.data,
      p_actor: session.user.id,
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
      actorId: session.user.id,
      actor: signatureActor({
        user: session.user,
        studentId: row.studentId,
        signerCanModify: canModify === true,
      }),
      service,
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

async function callWrite(
  service: ReturnType<typeof createServiceClient>,
  name: string,
  args: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { data, error } = await service.rpc(name, args);
  if (error) {
    console.error('signature write failed:', error.code ?? 'unknown');
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to update signature.' }, { status: 500 }),
    };
  }
  if (data === 'not_found') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'This signature does not exist.' }, { status: 404 }),
    };
  }
  if (data === 'forbidden') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'You cannot change this signature.' }, { status: 403 }),
    };
  }
  if (data !== 'ok') {
    console.error('signature write returned an unexpected result');
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to update signature.' }, { status: 500 }),
    };
  }
  return { ok: true };
}
