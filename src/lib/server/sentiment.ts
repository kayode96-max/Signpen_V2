import { SIGNATORY_NOTE_MAX, SENTIMENT_CALLS_PER_BOARD_PER_DAY } from '@/lib/security/limits';

const MAX_NOTES = 200;
const MODEL_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

export { SENTIMENT_CALLS_PER_BOARD_PER_DAY };

/** Machine-readable API codes. The dashboard owns the sentences. */
export const SENTIMENT_UNAVAILABLE_ERROR = 'summary_unavailable';
export const SENTIMENT_QUOTA_ERROR = 'summary_daily_limit';

/**
 * Seconds until the next 00:00:00 UTC. Rounded up so Retry-After does not
 * land before the quota actually resets. Minimum 1.
 */
export function secondsUntilNextUtcDay(now: Date = new Date()): number {
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((nextUtcMidnight - now.getTime()) / 1000));
}

/**
 * Prompt built only from signature notes. Names, emails, images, and user ids
 * are not accepted by this function, so they cannot be forwarded to Gemini.
 */
export function buildSentimentPrompt(notes: string[]): string | null {
  const cleaned: string[] = [];
  for (const note of notes) {
    const text = note.replace(/\s+/g, ' ').trim().slice(0, SIGNATORY_NOTE_MAX);
    if (!text) continue;
    cleaned.push(text);
    if (cleaned.length === MAX_NOTES) break;
  }
  if (cleaned.length === 0) return null;

  const lines = cleaned.map((note) => `- ${note}`).join('\n');
  return [
    'Summarize the overall sentiment of these short messages left on a graduation board.',
    'Describe the emotional trend only. Do not invent names, quotes, or details that are not in the messages.',
    '',
    'Messages:',
    lines,
  ].join('\n');
}

export function notesFromRows(rows: { signatoryNote?: string | null }[]): string[] {
  return rows.map((row) => row.signatoryNote ?? '');
}

/** null means the daily quota is already spent (SQL returned no row). */
export function interpretSentimentQuota(count: number | null): 'ok' | 'exhausted' {
  if (count == null || Number.isNaN(count)) return 'exhausted';
  return 'ok';
}

/** True when another successful summary may still be counted today. */
export function sentimentQuotaOpen(usedToday: number | null | undefined): boolean {
  return (
    typeof usedToday === 'number' &&
    Number.isFinite(usedToday) &&
    usedToday < SENTIMENT_CALLS_PER_BOARD_PER_DAY
  );
}

export function assertGeminiModel(model: string): string {
  if (!MODEL_PATTERN.test(model)) {
    throw new Error('GEMINI_MODEL contains unsupported characters.');
  }
  return model;
}
