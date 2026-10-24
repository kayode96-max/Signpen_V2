import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupPublicStudent = vi.hoisted(() => vi.fn());
const getCachedBoardSignatures = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  unstable_noStore: vi.fn(),
}));

vi.mock("@/components/signature/public-sign-out-page", () => ({
  default: () => null,
}));

vi.mock("@/lib/server/public-student", () => ({ lookupPublicStudent }));
vi.mock("@/lib/server/board-signatures", () => ({ getCachedBoardSignatures }));

import StudentPage from "./page";

const LETTERS = "abcdef01-1111-4111-8111-111111111111";

function render(studentId: string, search: Record<string, string | string[] | undefined> = {}) {
  return StudentPage({
    params: Promise.resolve({ studentId }),
    searchParams: Promise.resolve(search),
  });
}

async function redirectOf(
  studentId: string,
  search: Record<string, string | string[] | undefined> = {}
) {
  try {
    await render(studentId, search);
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    const parts = digest.split(";");
    return {
      url: parts.slice(2, -2).join(";"),
      status: parts.at(-2),
    };
  }
  throw new Error("expected redirect");
}

describe("shirt page canonical redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("308s an uppercase uuid to the lowercase path and preserves the query", async () => {
    const redirect = await redirectOf(LETTERS.toUpperCase(), { from: "QR" });

    expect(redirect.status).toBe("308");
    expect(redirect.url).toBe(`/${LETTERS}?from=QR`);
    expect(lookupPublicStudent).not.toHaveBeenCalled();
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });

  it("308s a mixed-case slug to its lowercase path and preserves the query", async () => {
    const redirect = await redirectOf("Chinwe-2026", { ref: "invite" });

    expect(redirect.status).toBe("308");
    expect(redirect.url).toBe("/chinwe-2026?ref=invite");
    expect(lookupPublicStudent).not.toHaveBeenCalled();
    expect(getCachedBoardSignatures).not.toHaveBeenCalled();
  });
});
