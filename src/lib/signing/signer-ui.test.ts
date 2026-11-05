import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SIGNATORY_NOTE_MAX } from '@/lib/security/limits';
import {
  SHIRT_HINT_DRAW,
  SHIRT_HINT_DRAW_AND_SPOT,
  SHIRT_HINT_SPOT,
  canonicalBoardUrl,
  decideShirtSubmit,
  graduateFirstName,
  noteCounterLabel,
  privateNoteLabel,
  shirtSubmitDisabled,
  whatsAppBoardShareHref,
  whatsAppShareHref,
} from './signer-ui';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('shirt submit', () => {
  it('submits a placement that is already on the shirt', () => {
    expect(decideShirtSubmit({ hasPlacement: true, hasDrawing: false, hasSpot: false })).toEqual({
      action: 'submit',
    });
  });

  it('places a drawing on the chosen spot instead of staying disabled', () => {
    expect(decideShirtSubmit({ hasPlacement: false, hasDrawing: true, hasSpot: true })).toEqual({
      action: 'place-then-submit',
    });
    expect(decideShirtSubmit({ hasPlacement: true, hasDrawing: true, hasSpot: true })).toEqual({
      action: 'place-then-submit',
    });
    expect(shirtSubmitDisabled(false)).toBe(false);
  });

  it('names the missing step when a drawing or a spot is absent', () => {
    expect(decideShirtSubmit({ hasPlacement: false, hasDrawing: false, hasSpot: false })).toEqual({
      action: 'hint',
      hint: SHIRT_HINT_DRAW_AND_SPOT,
    });
    expect(decideShirtSubmit({ hasPlacement: false, hasDrawing: false, hasSpot: true })).toEqual({
      action: 'hint',
      hint: SHIRT_HINT_DRAW,
    });
    expect(decideShirtSubmit({ hasPlacement: false, hasDrawing: true, hasSpot: false })).toEqual({
      action: 'hint',
      hint: SHIRT_HINT_SPOT,
    });
  });

  it('disables Done & Submit only while a save is in flight', () => {
    expect(shirtSubmitDisabled(true)).toBe(true);
    expect(shirtSubmitDisabled(false)).toBe(false);
  });
});

describe('note counter', () => {
  it('shows a live count against the 1000 character API cap', () => {
    expect(SIGNATORY_NOTE_MAX).toBe(1000);
    expect(noteCounterLabel(0)).toBe('0/1000');
    expect(noteCounterLabel(1)).toBe('1/1000');
    expect(noteCounterLabel(1000)).toBe('1000/1000');
  });

  it('matches the SQL note check', () => {
    const sql = readFileSync(
      path.join(root, 'supabase/migrations/20261025010000_rls_v2_schema.sql'),
      'utf8',
    );
    expect(sql).toContain('char_length(btrim("signatoryNote")) between 1 and 1000');
    const schema = readFileSync(path.join(root, 'src/lib/security/schemas.ts'), 'utf8');
    expect(schema).toContain('SIGNATORY_NOTE_MAX');
  });
});

describe('privacy label', () => {
  it('uses the graduate first name', () => {
    expect(graduateFirstName('  Ada Lovelace  ')).toBe('Ada');
    expect(privateNoteLabel('Ada Lovelace')).toBe('Message for Ada only');
    expect(privateNoteLabel('Cher')).toBe('Message for Cher only');
    expect(privateNoteLabel('   ')).toBe('Message for the graduate only');
  });
});

describe('WhatsApp board share', () => {
  it('builds a wa.me link with an encoded message and the lowercase board URL', () => {
    const href = whatsAppBoardShareHref({
      studentName: 'Ada Lovelace',
      studentId: '  AbC-DEF  ',
      origin: 'https://signpen.xyz/',
    });
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(href.slice('https://wa.me/?text='.length));
    expect(text).toContain('https://signpen.xyz/abc-def');
    expect(text).toContain("Ada Lovelace's board");
    expect(text).not.toMatch(/AbC/);
    expect(canonicalBoardUrl('QA-UNKNOWN-2026', 'https://signpen.xyz')).toBe(
      'https://signpen.xyz/qa-unknown-2026',
    );
  });

  it('encodes the message once', () => {
    expect(whatsAppShareHref('hello world')).toBe('https://wa.me/?text=hello%20world');
  });
});
