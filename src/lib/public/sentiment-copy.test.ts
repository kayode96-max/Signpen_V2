import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_SENTIMENT_ERROR,
  RETRYABLE_SENTIMENT_ERROR,
  sentimentCopyForStatus,
} from "@/lib/public/sentiment-copy";

describe("sentiment panel copy", () => {
  it("keys the daily limit off 429 and every other status off the retry sentence", () => {
    expect(sentimentCopyForStatus(429)).toEqual({
      message: RATE_LIMIT_SENTIMENT_ERROR,
      allowRetry: false,
    });
    expect(sentimentCopyForStatus(503)).toEqual({
      message: RETRYABLE_SENTIMENT_ERROR,
      allowRetry: true,
    });
    expect(sentimentCopyForStatus(500).allowRetry).toBe(true);
    expect(sentimentCopyForStatus(429).message).not.toBe("summary_daily_limit");
    expect(sentimentCopyForStatus(503).message).not.toBe("summary_unavailable");
  });
});
