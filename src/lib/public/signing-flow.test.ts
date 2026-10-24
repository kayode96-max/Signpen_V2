import { describe, expect, it, vi } from "vitest";
import {
  ALREADY_SIGNED_COPY,
  TURNSTILE_BEFORE_DRAW_COPY,
  classifySignatureFailure,
  fetchAlreadySigned,
  fetchTurnstileRequired,
  readAlreadySigned,
  readChallengeRequired,
  signatureErrorMessage,
} from "@/lib/public/signing-flow";

describe("signature challenge", () => {
  it("reads challenge_required from the challenge route", () => {
    expect(readChallengeRequired({ challenge_required: true })).toBe(true);
    expect(readChallengeRequired({ challenge_required: false })).toBe(false);
    expect(readChallengeRequired({ turnstileRequired: true })).toBe(false);
    expect(readChallengeRequired(null)).toBe(false);
  });

  it("does not block signing when the challenge route is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(fetchTurnstileRequired("board-1", fetchImpl as typeof fetch)).resolves.toBe(false);
  });

  it("asks for a token when the challenge route says one is required", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ challenge_required: true }), { status: 200 })
    );
    await expect(fetchTurnstileRequired("board-1", fetchImpl as typeof fetch)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/signatures/challenge?studentId=board-1",
      expect.objectContaining({ method: "GET" })
    );
  });
});

describe("already signed for this device session", () => {
  it("reads alreadySigned from GET /api/signatures", async () => {
    expect(readAlreadySigned({ alreadySigned: true })).toBe(true);
    expect(readAlreadySigned({ alreadySigned: false })).toBe(false);
    expect(readAlreadySigned(null)).toBe(false);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ alreadySigned: true }), { status: 200 })
    );
    await expect(fetchAlreadySigned("board-1", "token", fetchImpl as typeof fetch)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/signatures?studentId=board-1",
      expect.objectContaining({
        method: "GET",
        headers: { authorization: "Bearer token" },
      })
    );
  });

  it("does not block when the already-signed route fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(fetchAlreadySigned("board-1", "token", fetchImpl as typeof fetch)).resolves.toBe(false);
  });
});

describe("signature submit messages", () => {
  it("treats a 409 as already signed", () => {
    const signed = classifySignatureFailure(409, "already_signed");
    expect(signed?.code).toBe("already_signed");
    expect(signed?.message).toBe(ALREADY_SIGNED_COPY);
    expect(signatureErrorMessage(409, "You have already signed this board from this device.")).toBe(
      ALREADY_SIGNED_COPY
    );
  });

  it("asks for Turnstile on challenge_required and keeps other statuses plain", () => {
    expect(classifySignatureFailure(429, "challenge_required")?.message).toBe(TURNSTILE_BEFORE_DRAW_COPY);
    expect(signatureErrorMessage(429, "challenge_required")).toMatch(/not a robot/);
    expect(signatureErrorMessage(400, "Name is required.")).toBe("Name is required.");
    expect(signatureErrorMessage(500, "insert_signature returned no id")).toBe(
      "We couldn't save your signature. Please try again."
    );
  });
});
