import { describe, expect, it } from 'vitest';
import { SIGNATURE_IMAGE_MAX_BYTES } from '@/lib/security/limits';
import {
  feedbackRequestSchema,
  sentimentRequestSchema,
  signatureRequestSchema,
} from '@/lib/security/schemas';

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const pngUrl = (body = TINY_PNG) => `data:image/png;base64,${body}`;

const validSignature = {
  studentId: '11111111-1111-4111-8111-111111111111',
  signatureImageUrl: pngUrl(),
  signatoryName: 'Ada Lovelace',
  signatoryNote: 'Congratulations',
  position: { x: 0, y: 100 },
};

describe('signatureRequestSchema', () => {
  it('accepts a PNG data URL and the edges of the position box', () => {
    const parsed = signatureRequestSchema.parse(validSignature);
    expect(parsed.position).toEqual({ x: 0, y: 100 });
    expect(parsed.signatoryName).toBe('Ada Lovelace');
    expect(parsed.turnstileToken).toBeUndefined();
  });

  it('keeps a Turnstile token and treats a blank one as absent', () => {
    expect(signatureRequestSchema.parse({ ...validSignature, turnstileToken: '  abc  ' }).turnstileToken).toBe('abc');
    expect(signatureRequestSchema.parse({ ...validSignature, turnstileToken: '   ' }).turnstileToken).toBeUndefined();
  });

  it('trims the name and note and drops owner-only fields', () => {
    const parsed = signatureRequestSchema.parse({
      ...validSignature,
      signatoryName: '  Ada  ',
      signatoryNote: '  Hello  ',
      hidden_by_owner: true,
      signerUserId: '22222222-2222-4222-8222-222222222222',
    });
    expect(parsed.signatoryName).toBe('Ada');
    expect(parsed.signatoryNote).toBe('Hello');
    expect(parsed).not.toHaveProperty('hidden_by_owner');
    expect(parsed).not.toHaveProperty('signerUserId');
  });

  it('rejects a long name, an empty note, and a position outside 0-100', () => {
    expect(signatureRequestSchema.safeParse({ ...validSignature, signatoryName: 'A'.repeat(81) }).success).toBe(false);
    expect(signatureRequestSchema.safeParse({ ...validSignature, signatoryNote: '   ' }).success).toBe(false);
    expect(signatureRequestSchema.safeParse({ ...validSignature, position: { x: -0.1, y: 10 } }).success).toBe(false);
    expect(signatureRequestSchema.safeParse({ ...validSignature, position: { x: 10, y: 100.1 } }).success).toBe(false);
    expect(signatureRequestSchema.safeParse({ ...validSignature, position: { x: '10', y: 10 } }).success).toBe(false);
    expect(signatureRequestSchema.safeParse({ ...validSignature, studentId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects non-PNG payloads and images over 512KB', () => {
    expect(
      signatureRequestSchema.safeParse({
        ...validSignature,
        signatureImageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      }).success
    ).toBe(false);

    const tooBig = Buffer.alloc(SIGNATURE_IMAGE_MAX_BYTES + 8);
    tooBig.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const oversized = signatureRequestSchema.safeParse({
      ...validSignature,
      signatureImageUrl: pngUrl(tooBig.toString('base64')),
    });
    expect(oversized.success).toBe(false);
    if (!oversized.success) {
      expect(oversized.error.issues[0]?.message).toMatch(/512KB/);
    }
  });
});

describe('feedbackRequestSchema', () => {
  const base = {
    name: 'Mary Jane',
    email: 'mary@example.com',
    message: 'Loved the shirt.',
    turnstileToken: 'token-from-widget',
  };

  it('requires a rating only for reviews and treats a blank Turnstile token as absent', () => {
    expect(feedbackRequestSchema.safeParse({ ...base, type: 'review' }).success).toBe(false);
    expect(feedbackRequestSchema.parse({ ...base, type: 'review', rating: 5 }).rating).toBe(5);
    expect(feedbackRequestSchema.safeParse({ ...base, type: 'comment', rating: 4 }).success).toBe(false);
    expect(feedbackRequestSchema.parse({ ...base, type: 'inquiry' }).type).toBe('inquiry');
    expect(feedbackRequestSchema.parse({ ...base, type: 'comment', turnstileToken: '  ' }).turnstileToken).toBeUndefined();
    expect(
      feedbackRequestSchema.parse({
        name: base.name,
        email: base.email,
        message: base.message,
        type: 'comment',
      }).turnstileToken
    ).toBeUndefined();
  });

  it('rejects an invalid email and an oversized message', () => {
    expect(feedbackRequestSchema.safeParse({ ...base, type: 'comment', email: 'not-an-email' }).success).toBe(false);
    expect(
      feedbackRequestSchema.safeParse({ ...base, type: 'comment', message: 'm'.repeat(2001) }).success
    ).toBe(false);
  });
});

describe('sentimentRequestSchema', () => {
  it('drops a client-supplied signatures array', () => {
    const parsed = sentimentRequestSchema.parse({
      signatures: ['do not forward this', 'or this email ada@example.com'],
      signatureImageUrl: 'data:image/png;base64,aaaa',
    });
    expect(parsed).toEqual({});
    expect(parsed).not.toHaveProperty('signatures');
  });

  it('keeps a board id only when it is a uuid', () => {
    const id = '33333333-3333-4333-8333-333333333333';
    expect(sentimentRequestSchema.parse({ studentId: id }).studentId).toBe(id);
    expect(sentimentRequestSchema.safeParse({ studentId: 'board-1' }).success).toBe(false);
  });
});
