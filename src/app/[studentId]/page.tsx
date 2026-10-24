import { createElement } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { notFound, permanentRedirect } from "next/navigation";
import PublicSignOutPage from "@/components/signature/public-sign-out-page";
import type { PublicSignature } from "@/lib/public/board-signatures";
import { boardIdKind, normalizeBoardId, shirtCanonicalPath } from "@/lib/public/student-public";
import { getCachedBoardSignatures } from "@/lib/server/board-signatures";
import { lookupPublicStudent } from "@/lib/server/public-student";

type StudentPageProps = {
  params: Promise<{ studentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// A mixed-case or padded id redirects to its trimmed lowercase URL before any read.
// Ids that are neither a uuid nor a future slug may be cached for 60 seconds.
// A well-formed slug, an unknown uuid, and the couldn't-load state opt out below.
export const revalidate = 60;

export default async function StudentPage({ params, searchParams }: StudentPageProps) {
  const { studentId: rawId } = await params;
  const raw = typeof rawId === "string" ? rawId : "";
  const canonicalPath = shirtCanonicalPath(raw, searchParams ? await searchParams : {});
  if (canonicalPath) permanentRedirect(canonicalPath);

  const studentId = normalizeBoardId(raw);
  const kind = boardIdKind(studentId);

  // Special characters and very long junk are a 404 before any database call.
  if (kind === "invalid") {
    notFound();
  }

  // Slug lookup is not wired. get_student_public still takes a uuid, so a
  // well-formed slug is a 404 and is not sent to Supabase.
  if (kind === "slug") {
    noStore();
    notFound();
  }

  // No row from get_student_public is a 404 and must not be cached: the board
  // may have just been created. A query error renders the page and is no-store.
  const lookup = await lookupPublicStudent(studentId);

  if (lookup.kind === "missing") {
    noStore();
    notFound();
  }

  const studentLookupFailed = lookup.kind === "failed";
  if (studentLookupFailed) noStore();
  const student = lookup.kind === "found" ? lookup.student : null;

  let initialSignatures: PublicSignature[] = [];
  if (student) {
    try {
      initialSignatures = await getCachedBoardSignatures(studentId);
    } catch (err) {
      noStore();
      const message = err instanceof Error ? err.message : "Unknown signature lookup error";
      console.error("Board signatures failed:", message);
    }
  }

  return createElement(PublicSignOutPage, {
    studentId,
    initialStudent: student,
    initialSignatures,
    studentLookupFailed,
  });
}
