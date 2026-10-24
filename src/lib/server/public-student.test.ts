import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/supabase/config", () => ({
  supabase: { rpc },
}));

import { lookupPublicStudent } from "@/lib/server/public-student";

const BOARD = "11111111-1111-4111-8111-111111111111";
const LETTERS = "abcdef01-1111-4111-8111-111111111111";

describe("lookupPublicStudent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries get_student_public only with a uuid", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(lookupPublicStudent(BOARD)).resolves.toEqual({ kind: "missing" });
    await expect(lookupPublicStudent(LETTERS.toUpperCase())).resolves.toEqual({ kind: "missing" });
    await expect(lookupPublicStudent(`  ${LETTERS.toUpperCase()}  `)).resolves.toEqual({ kind: "missing" });
    await expect(lookupPublicStudent("qa-unknown-2026")).resolves.toEqual({ kind: "missing" });
    await expect(lookupPublicStudent("Chinwe-2026")).resolves.toEqual({ kind: "missing" });
    await expect(lookupPublicStudent("a".repeat(80))).resolves.toEqual({ kind: "missing" });
    await expect(lookupPublicStudent("b".repeat(2048))).resolves.toEqual({ kind: "missing" });

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenNthCalledWith(1, "get_student_public", { p_id: BOARD });
    expect(rpc).toHaveBeenNthCalledWith(2, "get_student_public", { p_id: LETTERS });
    expect(rpc).toHaveBeenNthCalledWith(3, "get_student_public", { p_id: LETTERS });
  });
});
