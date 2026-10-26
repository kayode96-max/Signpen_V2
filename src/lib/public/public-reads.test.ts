import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("public pages do not use revoked anon reads", () => {
  it("loads a shirt through get_student_public and 404s before a query", () => {
    const page = source("src/app/[studentId]/page.tsx");
    const lookup = source("src/lib/server/public-student.ts");
    expect(page).toContain("boardIdKind");
    expect(page).toContain('kind === "invalid"');
    expect(page).toContain('kind === "slug"');
    expect(page).toContain("lookupPublicStudent");
    expect(page).toContain("getCachedBoardSignatures");
    expect(page).toContain("noStore()");
    expect(page).not.toContain("from(\"students\")");
    expect(page).not.toContain("from('students')");
    expect(page).not.toContain(".select(\"id\")");
    expect(page).not.toContain(".select('id')");
    expect(page).not.toContain("signatures_public");
    expect(page).not.toContain("unstable_cache");
    expect(lookup).toContain("normalizeBoardId(studentId)");
    expect(lookup).toContain('rpc("get_student_public", { p_id: id })');
    expect(lookup).toContain("isStudentId(id)");
    expect(lookup.indexOf("normalizeBoardId(studentId)")).toBeLessThan(
      lookup.indexOf('rpc("get_student_public"')
    );
    expect(lookup.indexOf("isStudentId(id)")).toBeLessThan(lookup.indexOf('rpc("get_student_public"'));
    expect(lookup).not.toContain("unstable_cache(");
    const rejectGarbage = page.indexOf('kind === "invalid"');
    const slug = page.indexOf('kind === "slug"');
    const lookupCall = page.indexOf("lookupPublicStudent(");
    expect(rejectGarbage).toBeGreaterThan(-1);
    expect(slug).toBeGreaterThan(rejectGarbage);
    expect(slug).toBeLessThan(lookupCall);
    expect(rejectGarbage).toBeLessThan(lookupCall);
    expect(page.indexOf("permanentRedirect(")).toBeGreaterThan(-1);
    expect(page.indexOf("permanentRedirect(")).toBeLessThan(lookupCall);
    expect(page.indexOf("permanentRedirect(")).toBeLessThan(page.indexOf("getCachedBoardSignatures("));
    expect(page.indexOf("notFound()")).toBeGreaterThan(-1);
    expect(page.indexOf("notFound()")).toBeLessThan(lookupCall);
    expect(page.indexOf("notFound()")).toBeLessThan(page.indexOf("noStore()"));
    const missing = page.indexOf('lookup.kind === "missing"');
    expect(missing).toBeGreaterThan(-1);
    expect(page.indexOf("noStore()", missing)).toBeGreaterThan(missing);
  });

  it("submits signatures to the API and refetches the cached board route", () => {
    const page = source("src/components/signature/public-sign-out-page.tsx");
    expect(page).toContain('fetch("/api/signatures"');
    expect(page).toContain("fetchAlreadySigned");
    expect(source("src/lib/public/signing-flow.ts")).toContain("`/api/signatures?studentId=");
    expect(page).toContain("turnstileToken");
    expect(page).toContain("patchOwnSignature");
    expect(page).toContain("deleteOwnSignature");
    expect(page).toContain("EDITS_CLOSED_COPY");
    expect(page).toContain("`/api/boards/${studentId}/signatures`");
    expect(page.match(/<TurnstileWidget/g)).toHaveLength(1);
    expect(page).not.toContain("placement_taken");
    expect(page).not.toContain("signedIps");
    expect(page).not.toContain("signed_ips");
    expect(page).not.toContain("/api/ip");
    expect(page).not.toContain("from('students')");
    expect(page).not.toContain("from('signatures')");
    expect(page).not.toContain("signatures_public");
    expect(page).not.toContain("get_board_signatures");
    expect(page).toContain("student.name");
    expect(page).not.toContain("Message for Ada");
    expect(page).not.toMatch(/pass the phone/i);
    expect(page).not.toMatch(/already signed from this phone/i);
  });

  it("reads signatures_public once, behind boardCacheTag", () => {
    const server = source("src/lib/server/board-signatures.ts");
    const route = source("src/app/api/boards/[studentId]/signatures/route.ts");
    const writes = source("src/app/api/signatures/route.ts");
    expect(server).toContain("normalizeBoardId(studentId)");
    expect(server).toContain('rpc("signatures_public", { p_id: id })');
    expect(server.indexOf("normalizeBoardId(studentId)")).toBeLessThan(
      server.indexOf('rpc("signatures_public"')
    );
    expect(server).toContain('from "@/lib/cache/board"');
    expect(server).not.toContain("get_board_signatures");
    expect(route).toContain('from "@/lib/cache/board"');
    expect(route).toContain("boardCacheTag(studentId)");
    expect(route).toContain('boardCacheControl("success")');
    expect(route).toContain('boardCacheControl("error")');
    expect(route).toContain('boardCacheControl("invalid-id")');
    expect(route).toContain('boardCacheControl("unknown-board")');
    expect(route).toContain("boardIdKind");
    expect(route.indexOf('kind === "slug"')).toBeGreaterThan(-1);
    expect(route.indexOf('kind === "slug"')).toBeLessThan(route.indexOf("lookupPublicStudent("));
    expect(route.indexOf('kind === "invalid"')).toBeLessThan(route.indexOf("lookupPublicStudent("));
    expect(route.indexOf("signaturesCanonicalUrl(")).toBeLessThan(route.indexOf("lookupPublicStudent("));
    expect(route.indexOf("status: 308")).toBeLessThan(route.indexOf("lookupPublicStudent("));
    expect(route).toContain("BOARD_REDIRECT_CACHE_CONTROL");
    expect(route).not.toContain("export const revalidate");
    expect(source("src/lib/public/board-signatures.ts")).toContain("s-maxage=60");
    expect(route).toContain("getCachedBoardSignatures");
    expect(writes).toContain("revalidateTag(boardCacheTag(");
  });

  it("hides from the dashboard with PATCH and does not write signatures from the client", () => {
    const dashboard = source("src/app/dashboard/page.tsx");
    const writes = source("src/lib/public/signature-writes.ts");
    const hooks = source("src/supabase/db-hooks.tsx");
    const ownerReadStart = hooks.indexOf("const fetchCollection");
    const ownerRead = hooks.slice(ownerReadStart, hooks.indexOf("const handleLocalWrite", ownerReadStart));
    const share = source("src/components/dashboard/share-link.tsx");
    expect(share).toContain("boardUrl(studentId, window.location.origin)");
    expect(share).not.toContain("${window.location.origin}/${studentId}");
    expect(dashboard).toContain("patchHiddenByOwner");
    expect(dashboard).toContain("HIDE_UPDATE_FAILED_COPY");
    expect(dashboard).toContain("useCollection");
    expect(dashboard).toContain("could never be un-hidden");
    expect(dashboard).toContain("`students/${student.id}/signatures`");
    expect(dashboard).not.toContain("/api/boards/");
    expect(dashboard).not.toContain("getCachedBoardSignatures");
    expect(dashboard).not.toContain("signatures_public");
    expect(dashboard).not.toContain(".from('signatures')");
    expect(dashboard).not.toContain('.from("signatures")');
    expect(ownerRead).toContain(".select('*')");
    expect(ownerRead).not.toContain("hidden_by_owner = false");
    expect(ownerRead).not.toContain("signatures_public");
    expect(ownerRead).not.toContain("/api/boards/");
    expect(writes).toContain("hidden_by_owner");
    expect(writes).toContain('"PATCH"');
    expect(writes).toContain('"DELETE"');
  });

  it("reads the feedback wall without email or the base table", () => {
    const page = source("src/app/contact/page.tsx");
    const wall = source("src/lib/public/feedback-wall.ts");
    expect(page).not.toContain("useCollection");
    expect(page).not.toContain("from('feedback')");
    expect(page).not.toContain("from(\"feedback\")");
    expect(wall).toContain('from("feedback_public")');
    expect(wall).toContain("first_name");
    expect(wall).not.toContain('from("feedback")');
    expect(wall).not.toMatch(/select\([^)]*email/i);
  });

  it("does not query signed_ips or write signatures from the client data hooks", () => {
    const hooks = source("src/supabase/db-hooks.tsx");
    const update = hooks.slice(
      hooks.indexOf("export function updateDocumentNonBlocking"),
      hooks.indexOf("export function addDocumentNonBlocking")
    );
    const remove = hooks.slice(hooks.indexOf("export function deleteDocumentNonBlocking"));
    expect(hooks).not.toContain("export async function getDoc");
    expect(hooks).not.toContain("signed_ips");
    expect(hooks).not.toContain("signedIps");
    expect(hooks).not.toContain("ipAddress");
    expect(update.indexOf("refuseSignatureWrite")).toBeLessThan(update.indexOf(".update("));
    expect(remove.indexOf("refuseSignatureWrite")).toBeLessThan(remove.indexOf(".delete("));
  });
});
