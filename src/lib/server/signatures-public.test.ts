import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The row shape signatures_public returns. Hidden rows are dropped.
 * A private row stays, with a null note, so the shirt layout is unchanged.
 * Signer ids, device fields, IP data, and the raw flags are not copied.
 */
export function projectPublicSignature(row: {
  id: string;
  studentId: string;
  signatoryName: string;
  signatureImageUrl: string;
  signatoryNote: string;
  position: { x: number; y: number };
  timestamp: string;
  private_by_signer: boolean;
  hidden_by_owner: boolean;
  signerUserId?: string;
  ipHash?: string;
  device_id?: string;
}): {
  id: string;
  studentId: string;
  signatoryName: string;
  signatureImageUrl: string;
  signatoryNote: string | null;
  is_private: boolean;
  position: { x: number; y: number };
  timestamp: string;
} | null {
  if (row.hidden_by_owner) return null;
  return {
    id: row.id,
    studentId: row.studentId,
    signatoryName: row.signatoryName,
    signatureImageUrl: row.signatureImageUrl,
    signatoryNote: row.private_by_signer ? null : row.signatoryNote,
    is_private: row.private_by_signer,
    position: row.position,
    timestamp: row.timestamp,
  };
}

const base = {
  id: 'sig-1',
  studentId: '11111111-1111-4111-8111-111111111111',
  signatoryName: 'Grace',
  signatureImageUrl: 'data:image/png;base64,aaaa',
  signatoryNote: 'Only the graduate should read this',
  position: { x: 12.5, y: 40 },
  timestamp: '2026-10-22T09:00:00.000Z',
  signerUserId: '22222222-2222-4222-8222-222222222222',
  ipHash: 'ab'.repeat(32),
  device_id: 'device-1',
};

describe('signatures_public row projection', () => {
  it('drops a hidden row entirely', () => {
    expect(projectPublicSignature({
      ...base,
      hidden_by_owner: true,
      private_by_signer: false,
    })).toBeNull();
  });

  it('keeps a private row with a null note, is_private, and the same position', () => {
    const projected = projectPublicSignature({
      ...base,
      hidden_by_owner: false,
      private_by_signer: true,
    });

    expect(projected).toEqual({
      id: base.id,
      studentId: base.studentId,
      signatoryName: base.signatoryName,
      signatureImageUrl: base.signatureImageUrl,
      signatoryNote: null,
      is_private: true,
      position: { x: 12.5, y: 40 },
      timestamp: base.timestamp,
    });
    expect(projected).not.toHaveProperty('signerUserId');
    expect(projected).not.toHaveProperty('ipHash');
    expect(projected).not.toHaveProperty('device_id');
    expect(projected).not.toHaveProperty('private_by_signer');
    expect(projected).not.toHaveProperty('hidden_by_owner');
    expect(projected).not.toHaveProperty('signer_slot');
  });

  it('keeps a public note and reports is_private false', () => {
    const projected = projectPublicSignature({
      ...base,
      signatoryNote: 'So proud',
      hidden_by_owner: false,
      private_by_signer: false,
    });
    expect(projected?.signatoryNote).toBe('So proud');
    expect(projected?.is_private).toBe(false);
    expect(projected?.position).toEqual({ x: 12.5, y: 40 });
  });

  it('matches the SQL projection for signatures_public', () => {
    const rls = readFileSync(path.join(process.cwd(), 'supabase/migrations/0002_rls.sql'), 'utf8');
    const fn = rls.slice(
      rls.indexOf('function public.signatures_public(p_id uuid)'),
      rls.indexOf('alter function public.signatures_public')
    );
    expect(fn).toContain('case when s.private_by_signer then null else s."signatoryNote" end');
    expect(fn).toContain('s.private_by_signer as is_private');
    expect(fn).toContain('s.position');
    expect(fn).toContain('and s.hidden_by_owner = false');
    expect(fn).not.toContain('and s.private_by_signer = false');
  });
});
