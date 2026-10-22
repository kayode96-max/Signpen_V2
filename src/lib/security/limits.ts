/**
 * Limits shared by the API and the SQL backstop.
 * ASSUMPTION: the live product has not published these numbers. The SQL in
 * supabase/migrations/0002_rls.sql hard-codes the same ceilings. Change both.
 */

/** One device session can sign a board once (unique constraint). This is the extra network cap. */
export const SIGNATURES_PER_IP_PER_BOARD_PER_DAY = 10;

/** Across every board, from one hashed IP, per rolling 24 hours. */
export const SIGNATURES_PER_IP_PER_DAY = 30;

export const SIGNATURE_IP_WINDOW_HOURS = 24;

/** Hashed IP rows are deleted after this many days. See purge_old_signed_ips(). */
export const SIGNED_IP_RETENTION_DAYS = 30;

export const SENTIMENT_CALLS_PER_BOARD_PER_DAY = 5;

export const SIGNATORY_NAME_MAX = 80;
export const SIGNATORY_NOTE_MAX = 1000;

/** Character cap on the data URL. ASSUMPTION: matches a ~512KB PNG plus the prefix. */
export const SIGNATURE_IMAGE_MAX_CHARS = 700_000;

/** Decoded PNG byte cap. ASSUMPTION: the signing canvas is a small drawing, not a photo. */
export const SIGNATURE_IMAGE_MAX_BYTES = 512 * 1024;

export const FEEDBACK_NAME_MAX = 80;
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_EMAIL_MAX = 254;

export const IP_HASH_SALT_MIN = 16;
