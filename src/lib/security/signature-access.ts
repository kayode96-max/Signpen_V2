import type { SessionUser } from '@/lib/security/access';

export type SignatureActor = 'owner' | 'signer' | 'none';

/**
 * Owner: a real session whose id is the board id.
 * Signer: signer_can_modify, which is signer_owns plus the 24 hour window.
 * The same functions back the update and delete policies.
 */
export function signatureActor(input: {
  user: SessionUser;
  studentId: string;
  signerCanModify: boolean;
}): SignatureActor {
  if (!input.user.isAnonymous && input.user.id === input.studentId) return 'owner';
  if (input.signerCanModify) return 'signer';
  return 'none';
}

export interface SignaturePatchInput {
  signatoryName?: string;
  signatoryNote?: string;
  signatureImageUrl?: string;
  position?: { x: number; y: number };
  privateBySigner?: boolean;
  hidden_by_owner?: boolean;
}

export type SignatureChange =
  | { ok: true; changes: Record<string, unknown> }
  | { ok: false; status: 400 | 403; error: string };

const FORBIDDEN = 'You cannot change this signature.';

export function decideSignaturePatch(
  actor: SignatureActor,
  body: SignaturePatchInput
): SignatureChange {
  if (actor === 'none') return { ok: false, status: 403, error: FORBIDDEN };

  const keys = (Object.keys(body) as (keyof SignaturePatchInput)[]).filter(
    (key) => body[key] !== undefined
  );
  if (keys.length === 0) {
    return { ok: false, status: 400, error: 'No fields to update.' };
  }

  if (actor === 'owner') {
    if (keys.length !== 1 || keys[0] !== 'hidden_by_owner') {
      return { ok: false, status: 403, error: 'You can only change hidden_by_owner.' };
    }
    return { ok: true, changes: { hidden_by_owner: body.hidden_by_owner } };
  }

  if (body.hidden_by_owner !== undefined) {
    return { ok: false, status: 403, error: 'Only the board owner can change hidden_by_owner.' };
  }

  const changes: Record<string, unknown> = {};
  if (body.signatoryName !== undefined) changes.signatoryName = body.signatoryName;
  if (body.signatoryNote !== undefined) changes.signatoryNote = body.signatoryNote;
  if (body.signatureImageUrl !== undefined) changes.signatureImageUrl = body.signatureImageUrl;
  if (body.position !== undefined) changes.position = body.position;
  if (body.privateBySigner !== undefined) changes.private_by_signer = body.privateBySigner;
  return { ok: true, changes };
}

export function canDeleteSignature(actor: SignatureActor): boolean {
  return actor === 'owner' || actor === 'signer';
}
