import { describe, expect, it } from "vitest";
import {
  boardIdKind,
  boardUrl,
  canonicalBoardId,
  classifyStudentLookup,
  isStudentId,
  normalizeBoardId,
  publicStudentFromRpc,
  shirtCanonicalPath,
  signaturesCanonicalUrl,
} from "@/lib/public/student-public";

const ID = "11111111-1111-4111-8111-111111111111";

describe("isStudentId", () => {
  it("accepts a canonical uuid and rejects garbage or over-long ids", () => {
    expect(isStudentId(ID)).toBe(true);
    expect(isStudentId(ID.toUpperCase())).toBe(true);
    expect(isStudentId("not-a-uuid")).toBe(false);
    expect(isStudentId(`${ID}-extra`)).toBe(false);
    expect(isStudentId("a".repeat(400))).toBe(false);
    expect(isStudentId("")).toBe(false);
  });
});

describe("boardIdKind", () => {
  it("classifies a uuid, a future slug, and junk that is neither", () => {
    expect(boardIdKind(ID)).toBe("uuid");
    expect(boardIdKind(ID.toUpperCase())).toBe("uuid");
    expect(boardIdKind("qa-unknown-2026")).toBe("slug");
    expect(boardIdKind("abc")).toBe("slug");
    expect(boardIdKind("a1-b2")).toBe("slug");
    expect(boardIdKind("a".repeat(30))).toBe("slug");
    expect(boardIdKind("ab")).toBe("invalid");
    expect(boardIdKind("a".repeat(31))).toBe("invalid");
    expect(boardIdKind("a".repeat(80))).toBe("invalid");
    expect(boardIdKind("b".repeat(2048))).toBe("invalid");
    expect(boardIdKind("QA-Unknown-2026")).toBe("slug");
    expect(boardIdKind("Chinwe-2026")).toBe("slug");
    expect(boardIdKind("  Chinwe-2026  ")).toBe("slug");
    expect(boardIdKind(`  ${ID.toUpperCase()}  `)).toBe("uuid");
    const letters = "abcdef01-1111-4111-8111-111111111111";
    expect(boardIdKind(letters.toUpperCase())).toBe("uuid");
    expect(normalizeBoardId(`  ${letters.toUpperCase()}  `)).toBe(letters);
    expect(canonicalBoardId(letters.toUpperCase())).toBe(letters);
    expect(canonicalBoardId("Chinwe-2026")).toBe("chinwe-2026");
    expect(canonicalBoardId("chinwe-2026")).toBeNull();
    expect(canonicalBoardId(ID)).toBeNull();
    expect(shirtCanonicalPath("Chinwe-2026", { ref: "invite" })).toBe("/chinwe-2026?ref=invite");
    expect(
      signaturesCanonicalUrl("http://localhost/api/boards/Chinwe-2026/signatures?from=QR", "Chinwe-2026")
    ).toBe("http://localhost/api/boards/chinwe-2026/signatures?from=QR");
    expect(boardIdKind("qa_unknown")).toBe("invalid");
    expect(boardIdKind("bad slug")).toBe("invalid");
    expect(boardIdKind("-qa")).toBe("invalid");
    expect(boardIdKind("qa-")).toBe("invalid");
    expect(boardIdKind("qa--unknown")).toBe("invalid");
    expect(boardIdKind("")).toBe("invalid");
  });
});

describe("boardUrl", () => {
  it("lowercases an uppercase uuid", () => {
    const upper = "ABCDEF01-1111-4111-8111-111111111111";
    const url = boardUrl(`  ${upper}  `, "https://signpen.xyz/");

    expect(url).toBe("https://signpen.xyz/abcdef01-1111-4111-8111-111111111111");
    expect(url).toBe(url.toLowerCase());
    expect(url).not.toContain(upper);
  });
});

describe("publicStudentFromRpc", () => {
  it("maps one get_student_public row and drops anything outside that shape", () => {
    const student = publicStudentFromRpc([
      {
        id: ID,
        name: "Ada",
        email: "ada@example.com",
        profilePhotoUrl: "https://example.com/a.png",
        pageSettings: {
          theme: "light",
          pageHeading: "Ada's shirt",
          pageSubheading: "Sign it",
          backgroundImageUrl: "https://example.com/bg.png",
        },
        popupMessageConfig: { title: "Thanks", message: "You signed" },
      },
    ]);

    expect(student).toEqual({
      id: ID,
      name: "Ada",
      profilePhotoUrl: "https://example.com/a.png",
      pageSettings: {
        theme: "light",
        pageHeading: "Ada's shirt",
        pageSubheading: "Sign it",
        backgroundImageUrl: "https://example.com/bg.png",
      },
      popupMessageConfig: { title: "Thanks", message: "You signed" },
    });
    expect(student).not.toHaveProperty("email");
  });

  it("keeps an uppercase uuid from the rpc in lowercase", () => {
    const letters = "abcdef01-1111-4111-8111-111111111111";
    expect(publicStudentFromRpc([{ id: letters.toUpperCase(), name: "Ada" }])?.id).toBe(letters);
  });

  it("treats an empty rpc result as a missing board", () => {
    expect(publicStudentFromRpc([])).toBeNull();
    expect(publicStudentFromRpc(null)).toBeNull();
    expect(publicStudentFromRpc(undefined)).toBeNull();
  });
});

describe("classifyStudentLookup", () => {
  it("404s a valid uuid with no board and does not 404 a query error", () => {
    expect(classifyStudentLookup(null, []).kind).toBe("missing");
    expect(classifyStudentLookup(null, null).kind).toBe("missing");
    expect(classifyStudentLookup({ message: "fetch failed" }, []).kind).toBe("failed");
    expect(classifyStudentLookup(null, [{ id: ID, name: "Ada" }]).kind).toBe("found");
  });
});
