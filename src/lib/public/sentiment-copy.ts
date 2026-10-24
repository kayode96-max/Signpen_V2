export const RETRYABLE_SENTIMENT_ERROR =
  "Couldn't get a summary right now. Please try again in a few minutes.";

export const RATE_LIMIT_SENTIMENT_ERROR =
  "You've used today's 5 summaries. You can get more tomorrow.";

/**
 * Dashboard copy is keyed by status. 429 is the daily cap.
 * 503 summary_unavailable, and any other failure, uses the retry sentence.
 * The response body is a machine code and is not shown.
 */
export function sentimentCopyForStatus(status: number): { message: string; allowRetry: boolean } {
  if (status === 429) {
    return { message: RATE_LIMIT_SENTIMENT_ERROR, allowRetry: false };
  }
  return { message: RETRYABLE_SENTIMENT_ERROR, allowRetry: true };
}
