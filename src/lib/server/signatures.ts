import { hashIp } from '@/lib/security/ip-hash';
import { IP_HASH_SALT_MIN } from '@/lib/security/limits';
import { firstZodError, signatureRequestSchema } from '@/lib/security/schemas';

export interface SignatureWriteArgs {
  p_student_id: string;
  p_signer_user_id: string;
  p_image: string;
  p_name: string;
  p_note: string;
  p_position: { x: number; y: number };
  p_private: boolean;
  p_ip_hash: string;
}

export type SignatureWriteResult =
  | { ok: true; id: string }
  | { ok: false; code?: string; message?: string };

export interface SignatureWriteContext {
  userId: string;
  ip: string | null;
  salt: string | undefined;
  write: (args: SignatureWriteArgs) => Promise<SignatureWriteResult>;
}

export interface ApiBody {
  status: number;
  body: { error?: string; signature_id?: string };
}

/**
 * Maps insert_signature failures to HTTP statuses.
 * Anything unrecognized is a 500. Callers must not ignore the error.
 */
export function mapSignatureWriteError(error: {
  code?: string;
  message?: string;
}): { status: number; error: string } {
  const message = error.message ?? '';
  if (message.includes('board_not_found') || error.code === 'P0002' || error.code === '23503') {
    return { status: 404, error: 'This board does not exist.' };
  }
  if (message.includes('rate_limited') || error.code === 'P0004') {
    return {
      status: 429,
      error: 'Too many signatures from this network. Try again tomorrow.',
    };
  }
  if (
    error.code === '23505' ||
    message.includes('already_signed') ||
    message.includes('duplicate key')
  ) {
    return { status: 409, error: 'You have already signed this board from this device.' };
  }
  if (error.code === '23514' || error.code === '23502') {
    return { status: 400, error: 'Signature was rejected by a database check.' };
  }
  return { status: 500, error: 'Failed to record signature.' };
}

export async function createSignature(
  raw: unknown,
  ctx: SignatureWriteContext
): Promise<ApiBody> {
  const parsed = signatureRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: { error: firstZodError(parsed.error) } };
  }
  if (!ctx.userId) {
    return { status: 401, body: { error: 'Unauthorized: Could not verify your session.' } };
  }
  if (!ctx.salt || ctx.salt.trim().length < IP_HASH_SALT_MIN) {
    return { status: 503, body: { error: 'IP_HASH_SALT is not configured on the server.' } };
  }
  if (!ctx.ip) {
    return {
      status: 400,
      body: { error: 'Could not determine a client IP for rate limiting.' },
    };
  }

  let ipHash: string;
  try {
    ipHash = hashIp(ctx.ip, ctx.salt);
  } catch {
    return { status: 503, body: { error: 'IP_HASH_SALT is not configured on the server.' } };
  }

  const args: SignatureWriteArgs = {
    p_student_id: parsed.data.studentId,
    p_signer_user_id: ctx.userId,
    p_image: parsed.data.signatureImageUrl,
    p_name: parsed.data.signatoryName,
    p_note: parsed.data.signatoryNote,
    p_position: parsed.data.position,
    p_private: parsed.data.privateBySigner ?? false,
    p_ip_hash: ipHash,
  };

  const written = await ctx.write(args);
  if (!written.ok) {
    const mapped = mapSignatureWriteError(written);
    return { status: mapped.status, body: { error: mapped.error } };
  }
  return { status: 201, body: { signature_id: written.id } };
}
