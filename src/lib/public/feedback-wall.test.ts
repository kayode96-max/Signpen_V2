import { describe, expect, it } from "vitest";
import { FEEDBACK_PUBLIC_COLUMNS, mapFeedbackRow } from "@/lib/public/feedback-wall";

describe("feedback wall", () => {
  it("selects the public view columns and never email", () => {
    expect(FEEDBACK_PUBLIC_COLUMNS).toBe("id, first_name, message, type, rating, created_at");
    expect(FEEDBACK_PUBLIC_COLUMNS).not.toMatch(/email/i);
  });

  it("maps a public row and ignores an email if one is present", () => {
    const item = mapFeedbackRow({
      id: "fb-1",
      first_name: "Ada",
      email: "ada@example.com",
      message: "Loved it",
      type: "review",
      rating: 5,
      created_at: "2026-10-22T00:00:00.000Z",
    });

    expect(item).toEqual({
      id: "fb-1",
      first_name: "Ada",
      message: "Loved it",
      type: "review",
      rating: 5,
      created_at: "2026-10-22T00:00:00.000Z",
    });
    expect(item).not.toHaveProperty("email");
  });
});
