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
  /** True only after Cloudflare accepted a Turnstile token for this request. */
  p_challenge_passed: boolean;
}

export type SignatureWriteResult =
  | { ok: true; id: string }
  | { ok: false; code?: string; message?: string };

export type TurnstileCheck = 'valid' | 'invalid' | 'unavailable';

export interface SignatureWriteContext {
  userId: string;
  ip: string | null;
  salt: string | undefined;
  /**
   * Called only when the hourly board cap is already reached and the body
   * includes a token. Under the cap the token is ignored.
   */
  verifyTurnstile?: (token: string) => Promise<TurnstileCheck>;
  write: (args: SignatureWriteArgs) => Promise<SignatureWriteResult>;
}

export interface ApiBody {
  status: number;
  body: { error?: string; signature_id?: string };
}

export const CHALLENGE_REQUIRED = 'challenge_required';
export const CHALLENGE_UNAVAILABLE = 'challenge_unavailable';

export function isChallengeRequired(error: { code?: string; message?: string }): boolean {
  return (error.message ?? '').includes(CHALLENGE_REQUIRED);
}

/**
 * Maps insert_signature failures to HTTP statuses.
 * Anything unrecognized is a 500. Callers must not ignore the error.
 * The hourly cap is not a hard block: it is challenge_required.
 */
export function mapSignatureWriteError(error: {
  code?: string;
  message?: string;
}): { status: number; error: string } {
  const message = error.message ?? '';
  if (isChallengeRequired(error)) {
    return { status: 429, error: CHALLENGE_REQUIRED };
  }
  if (message.includes('board_not_found') || error.code === 'P0002' || error.code === '23503') {
    return { status: 404, error: 'This board does not exist.' };
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

  const base = {
    p_student_id: parsed.data.studentId,
    p_signer_user_id: ctx.userId,
    p_image: parsed.data.signatureImageUrl,
    p_name: parsed.data.signatoryName,
    p_note: parsed.data.signatoryNote,
    p_position: parsed.data.position,
    p_private: parsed.data.privateBySigner ?? false,
    p_ip_hash: ipHash,
  };

  const write = (passed: boolean) => ctx.write({ ...base, p_challenge_passed: passed });

  const first = await write(false);
  if (first.ok) {
    return { status: 201, body: { signature_id: first.id } };
  }
  if (!isChallengeRequired(first)) {
    const mapped = mapSignatureWriteError(first);
    return { status: mapped.status, body: { error: mapped.error } };
  }

  const token = parsed.data.turnstileToken;
  if (!token) {
    return { status: 429, body: { error: CHALLENGE_REQUIRED } };
  }
  if (!ctx.verifyTurnstile) {
    return { status: 503, body: { error: CHALLENGE_UNAVAILABLE } };
  }

  const verdict = await ctx.verifyTurnstile(token);
  if (verdict === 'unavailable') {
    return { status: 503, body: { error: CHALLENGE_UNAVAILABLE } };
  }
  if (verdict !== 'valid') {
    return { status: 429, body: { error: CHALLENGE_REQUIRED } };
  }

  const second = await write(true);
  if (!second.ok) {
    const mapped = mapSignatureWriteError(second);
    return { status: mapped.status, body: { error: mapped.error } };
  }
  return { status: 201, body: { signature_id: second.id } };
}
