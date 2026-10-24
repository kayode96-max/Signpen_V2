import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_CACHE_CONTROL,
  BOARD_INVALID_ID_CACHE_CONTROL,
  BOARD_NO_STORE,
} from "@/lib/public/board-signatures";

const lookupPublicStudent = vi.hoisted(() => vi.fn());
const getCachedBoardSignatures = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/public-student", () => ({ lookupPublicStudent }));
vi.mock("@/lib/server/board-signatures", () => ({ getCachedBoardSignatures }));

import { GET } from "./route";

const BOARD = "11111111-1111-4111-8111-111111111111";
const LETTERS = "abcdef01-1111-4111-8111-111111111111";

function call(studentId: string, query = "") {
  return GET(new Request(`http://localhost/api/boards/${studentId}/signatures${query}`), {
    params: Promise.resolve({ studentId }),
  });
}

describe("GET /api/boards/[studentId]/signatures cache headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupPublicStudent.mockReset();
    getCachedBoardSignatures.mockReset();
  });

  it("caches a successful board for 60s with stale-while-revalidate", async () => {
    lookupPublicStudent.mockResolvedValue({
      kind: "found",
      student: { id: BOARD, name: "Ada" },
    });
    getCachedBoardSignatures.mockResolvedValue([]);

    const response = await call(BOARD);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(BOARD_CACHE_CONTROL);
    expect(getCachedBoardSignatures).toHaveBeenCalledWith(BOARD, `board:${BOARD}`);
  });

  it("does not store an error response", async () => {
    lookupPublicStudent.mockResolvedValue({ kind: "failed" });

    const response = await call(BOARD);

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(BOARD_NO_STORE);
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });

  it("does not store a signatures read that throws", async () => {
    lookupPublicStudent.mockResolvedValue({
      kind: "found",
      student: { id: BOARD, name: "Ada" },
    });
    getCachedBoardSignatures.mockRejectedValue(new Error("rpc down"));

    const response = await call(BOARD);

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(BOARD_NO_STORE);
  });

  it("caches a 404 for 80-character junk", async () => {
    const response = await call("a".repeat(80));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(BOARD_INVALID_ID_CACHE_CONTROL);
    expect(lookupPublicStudent).not.toHaveBeenCalled();
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });

  it("caches a 404 for 2048-character junk", async () => {
    const response = await call("b".repeat(2048));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(BOARD_INVALID_ID_CACHE_CONTROL);
    expect(lookupPublicStudent).not.toHaveBeenCalled();
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });

  it("caches a 404 for special characters that are not a slug", async () => {
    const response = await call("qa_unknown");

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(BOARD_INVALID_ID_CACHE_CONTROL);
    expect(lookupPublicStudent).not.toHaveBeenCalled();
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });

  it("308s an uppercase uuid to the lowercase url before any cached read", async () => {
    const response = await call(LETTERS.toUpperCase(), "?from=QR");

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      `http://localhost/api/boards/${LETTERS}/signatures?from=QR`
    );
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("Cache-Control")).not.toContain("s-maxage");
    expect(lookupPublicStudent).not.toHaveBeenCalled();
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });

  it("308s a mixed-case slug to its lowercase form and preserves the query", async () => {
    const response = await call("Chinwe-2026", "?ref=invite");

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "http://localhost/api/boards/chinwe-2026/signatures?ref=invite"
    );
    expect(response.headers.get("Cache-Control")).not.toContain("s-maxage");
    expect(lookupPublicStudent).not.toHaveBeenCalled();
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });

  it("does not cache a 404 for a well-formed slug and does not query with it", async () => {
    const response = await call("qa-unknown-2026");

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(BOARD_NO_STORE);
    expect(lookupPublicStudent).not.toHaveBeenCalled();
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });

  it("does not cache a 404 for a valid uuid with no board", async () => {
    lookupPublicStudent.mockResolvedValue({ kind: "missing" });

    const response = await call(BOARD);

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(BOARD_NO_STORE);
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });
});
