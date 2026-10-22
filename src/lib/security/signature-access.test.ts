import { describe, expect, it } from 'vitest';
import { boardCacheTag } from '@/lib/cache/board';
import {
  canDeleteSignature,
  decideSignaturePatch,
  signatureActor,
} from '@/lib/security/signature-access';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIGNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('signatureActor', () => {
  it('treats a real user whose id is the board as the owner', () => {
    expect(signatureActor({
      user: { id: OWNER, isAnonymous: false },
      studentId: OWNER,
      signerCanModify: false,
    })).toBe('owner');
  });

  it('does not give an anonymous session owner rights, even on its own id', () => {
    expect(signatureActor({
      user: { id: OWNER, isAnonymous: true },
      studentId: OWNER,
      signerCanModify: false,
    })).toBe('none');
  });

  it('treats signer_can_modify as the signer inside the 24 hour window', () => {
    expect(signatureActor({
      user: { id: SIGNER, isAnonymous: true },
      studentId: OWNER,
      signerCanModify: true,
    })).toBe('signer');
  });

  it('refuses everyone else, including a signer whose window has closed', () => {
    expect(signatureActor({
      user: { id: SIGNER, isAnonymous: false },
      studentId: OWNER,
      signerCanModify: false,
    })).toBe('none');
  });

  it('keeps the owner on the owner path when they also signed', () => {
    expect(signatureActor({
      user: { id: OWNER, isAnonymous: false },
      studentId: OWNER,
      signerCanModify: true,
    })).toBe('owner');
  });
});

describe('decideSignaturePatch', () => {
  it('lets the owner set only hidden_by_owner', () => {
    expect(decideSignaturePatch('owner', { hidden_by_owner: true })).toEqual({
      ok: true,
      changes: { hidden_by_owner: true },
    });
    const refused = decideSignaturePatch('owner', {
      hidden_by_owner: true,
      signatoryName: 'Ada',
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.status).toBe(403);
    const note = decideSignaturePatch('owner', { privateBySigner: true });
    expect(note.ok).toBe(false);
    if (!note.ok) expect(note.status).toBe(403);
  });

  it('lets the signer change the shirt fields and not the owner flag', () => {
    expect(decideSignaturePatch('signer', {
      signatoryName: 'Ada',
      signatoryNote: 'Hello',
      signatureImageUrl: 'data:image/png;base64,aa',
      position: { x: 12.5, y: 40 },
      privateBySigner: true,
    })).toEqual({
      ok: true,
      changes: {
        signatoryName: 'Ada',
        signatoryNote: 'Hello',
        signatureImageUrl: 'data:image/png;base64,aa',
        position: { x: 12.5, y: 40 },
        private_by_signer: true,
      },
    });
    const hidden = decideSignaturePatch('signer', { hidden_by_owner: true });
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.status).toBe(403);
  });

  it('refuses a stranger and an empty patch', () => {
    expect(decideSignaturePatch('none', { signatoryName: 'Ada' }).ok).toBe(false);
    const empty = decideSignaturePatch('signer', {});
    expect(empty).toEqual({ ok: false, status: 400, error: 'No fields to update.' });
  });
});

describe('canDeleteSignature', () => {
  it('allows the owner and the signer in the window', () => {
    expect(canDeleteSignature('owner')).toBe(true);
    expect(canDeleteSignature('signer')).toBe(true);
    expect(canDeleteSignature('none')).toBe(false);
  });
});

describe('boardCacheTag', () => {
  it('builds the tag the routes pass to revalidateTag', () => {
    expect(boardCacheTag(OWNER)).toBe(`board:${OWNER}`);
  });
});
