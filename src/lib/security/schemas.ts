import { z } from 'zod';
import {
  FEEDBACK_EMAIL_MAX,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_NAME_MAX,
  SIGNATORY_NAME_MAX,
  SIGNATORY_NOTE_MAX,
  SIGNATURE_IMAGE_MAX_BYTES,
  SIGNATURE_IMAGE_MAX_CHARS,
} from '@/lib/security/limits';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

const coordinate = (axis: 'x' | 'y') =>
  z
    .number({ invalid_type_error: `position.${axis} must be a number.` })
    .finite(`position.${axis} must be a number.`)
    .min(0, 'position.x and position.y must be between 0 and 100.')
    .max(100, 'position.x and position.y must be between 0 and 100.');

export const signatureImageSchema = z
  .string()
  .max(SIGNATURE_IMAGE_MAX_CHARS, 'Signature image is too large.')
  .superRefine((value, ctx) => {
    const match = PNG_DATA_URL.exec(value);
    if (!match || match[1].length % 4 !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Signature image must be a base64 PNG data URL.',
      });
      return;
    }
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length > SIGNATURE_IMAGE_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Signature image must be 512KB or smaller.',
      });
      return;
    }
    if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Signature image must be a PNG.',
      });
    }
  });

export const signatureRequestSchema = z.object({
  studentId: z.string().uuid('studentId must be a UUID.'),
  signatureImageUrl: signatureImageSchema,
  signatoryName: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(SIGNATORY_NAME_MAX, `Name must be ${SIGNATORY_NAME_MAX} characters or fewer.`),
  signatoryNote: z
    .string()
    .trim()
    .min(1, 'Note is required.')
    .max(SIGNATORY_NOTE_MAX, `Note must be ${SIGNATORY_NOTE_MAX} characters or fewer.`),
  position: z.object({
    x: coordinate('x'),
    y: coordinate('y'),
  }),
  /**
   * Signer choice: only the graduate sees this signature.
   * hidden_by_owner is intentionally absent. Only the board owner can set it,
   * and the owner cannot change private_by_signer.
   */
  privateBySigner: z.boolean().optional(),
  /**
   * Sent only after GET /api/signatures/challenge reports challenge_required.
   * A blank value is treated as absent. The server checks it with
   * TURNSTILE_SECRET_KEY once the hourly board cap is reached.
   */
  turnstileToken: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(2048).optional()
  ),
});

export type SignatureRequest = z.infer<typeof signatureRequestSchema>;

export const feedbackRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(FEEDBACK_NAME_MAX, `Name must be ${FEEDBACK_NAME_MAX} characters or fewer.`),
    email: z
      .string()
      .trim()
      .email('Email must be a valid email address.')
      .max(FEEDBACK_EMAIL_MAX, `Email must be ${FEEDBACK_EMAIL_MAX} characters or fewer.`),
    message: z
      .string()
      .trim()
      .min(1, 'Message is required.')
      .max(FEEDBACK_MESSAGE_MAX, `Message must be ${FEEDBACK_MESSAGE_MAX} characters or fewer.`),
    type: z.enum(['comment', 'review', 'inquiry']),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    turnstileToken: z.string().trim().min(1, 'Turnstile token is required.').max(2048),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'review' && (value.rating === null || value.rating === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rating'],
        message: 'Reviews must include a rating from 1 to 5.',
      });
    }
    if (value.type !== 'review' && value.rating !== null && value.rating !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rating'],
        message: 'Rating is only allowed on reviews.',
      });
    }
  });

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

/** Unknown keys (including a client-supplied signatures array) are dropped. */
export const sentimentRequestSchema = z.object({
  studentId: z.string().uuid('studentId must be a UUID.').optional(),
});

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request.';
}
