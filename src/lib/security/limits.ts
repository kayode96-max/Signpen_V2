/**
 * Limits shared by the API and the SQL backstop.
 * The SQL in supabase/migrations/20261025020000_rls_v2_functions.sql hard-codes
 * the same ceilings.
 * Change both.
 */

/**
 * Hashed IP signatures on one board in a rolling hour.
 * Past this, the signer must pass Turnstile. There is no cross-board cap.
 */
export const SIGNATURES_PER_IP_PER_BOARD_PER_HOUR = 100;

export const SIGNATURE_IP_WINDOW_HOURS = 1;

/** Feedback posts from one hashed IP in a rolling hour, after Turnstile. */
export const FEEDBACK_PER_IP_PER_HOUR = 5;

/** Hashed IP rows are deleted after this many days. */
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
