import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const stored = vi.hoisted(() => [] as Array<{ tags?: string[] }>);

vi.mock("@/supabase/config", () => ({
  supabase: { rpc },
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    callback: () => Promise<unknown>,
    _key: string[],
    options: { tags?: string[] }
  ) => {
    return async () => {
      const value = await callback();
      stored.push({ tags: options.tags });
      return value;
    };
  },
}));

import { getCachedBoardSignatures, readPublicSignatures } from "@/lib/server/board-signatures";

const BOARD = "11111111-1111-4111-8111-111111111111";
const LETTERS = "abcdef01-1111-4111-8111-111111111111";
const row = {
  id: "sig-1",
  signatoryName: "Tolu",
  signatureImageUrl: "data:image/png;base64,aaaa",
  signatoryNote: "Hello",
  is_private: false,
  position: { x: 1, y: 2 },
};

describe("board signature cache", () => {
  beforeEach(() => {
    stored.length = 0;
    vi.clearAllMocks();
  });

  it("returns a public row without caching the read itself", async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    const signatures = await readPublicSignatures(BOARD);
    expect(signatures[0]?.signatoryName).toBe("Tolu");
    expect(stored).toHaveLength(0);
  });

  it("stores a successful cached read under the board tag", async () => {
    rpc.mockResolvedValue({ data: [row], error: null });

    const signatures = await getCachedBoardSignatures(BOARD);

    expect(signatures).toHaveLength(1);
    expect(stored).toEqual([{ tags: [`board:${BOARD}`] }]);
    expect(rpc).toHaveBeenCalledWith("signatures_public", { p_id: BOARD });
  });

  it("stores an uppercase uuid under the lowercase board tag", async () => {
    rpc.mockResolvedValue({ data: [row], error: null });

    await getCachedBoardSignatures(LETTERS.toUpperCase());

    expect(stored).toEqual([{ tags: [`board:${LETTERS}`] }]);
    expect(rpc).toHaveBeenCalledWith("signatures_public", { p_id: LETTERS });
  });

  it("does not store a failed read under the board tag", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(getCachedBoardSignatures(BOARD)).rejects.toThrow("db down");
    await expect(readPublicSignatures(BOARD)).rejects.toThrow("db down");
    expect(stored).toHaveLength(0);
  });
});
