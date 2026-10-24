import { NextResponse } from "next/server";
import { boardCacheTag } from "@/lib/cache/board";
import { BOARD_REDIRECT_CACHE_CONTROL, boardCacheControl } from "@/lib/public/board-signatures";
import { boardIdKind, normalizeBoardId, signaturesCanonicalUrl } from "@/lib/public/student-public";
import { getCachedBoardSignatures } from "@/lib/server/board-signatures";
import { lookupPublicStudent } from "@/lib/server/public-student";

/**
 * The only public signatures read. The shirt page uses the same cached helper
 * for first paint. Realtime, focus, and the 30s poll refetch this route.
 * The browser never calls signatures_public.
 *
 * A mixed-case or padded id is a 308 to the trimmed lowercase URL before any
 * read, so the cache tag matches the lowercase uuid Backend invalidates.
 * This handler stays dynamic. Success is cached inside getCachedBoardSignatures
 * and advertised with s-maxage=60, stale-while-revalidate=300. Errors and
 * well-formed misses are no-store and are not written under the board tag.
 * Only an id that is neither a uuid nor a future slug may be cached as a 404.
 * Slug lookup is not wired: get_student_public still takes p_id, so a
 * well-formed slug 404s here and is not sent to Supabase.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  const { studentId: rawId } = await context.params;
  const redirectTo = signaturesCanonicalUrl(req.url, rawId);
  if (redirectTo) {
    return NextResponse.redirect(redirectTo, {
      status: 308,
      headers: { "Cache-Control": BOARD_REDIRECT_CACHE_CONTROL },
    });
  }

  const studentId = normalizeBoardId(rawId);
  const kind = boardIdKind(studentId);
  if (kind === "invalid") {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": boardCacheControl("invalid-id") } }
    );
  }
  if (kind === "slug") {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": boardCacheControl("unknown-board") } }
    );
  }

  const lookup = await lookupPublicStudent(studentId);
  if (lookup.kind === "missing") {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": boardCacheControl("unknown-board") } }
    );
  }
  if (lookup.kind === "failed") {
    return NextResponse.json(
      { error: "Could not load signatures." },
      { status: 500, headers: { "Cache-Control": boardCacheControl("error") } }
    );
  }

  try {
    const signatures = await getCachedBoardSignatures(studentId, boardCacheTag(studentId));
    return NextResponse.json(signatures, {
      headers: { "Cache-Control": boardCacheControl("success") },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("Board signatures failed:", message);
    return NextResponse.json(
      { error: "Could not load signatures." },
      { status: 500, headers: { "Cache-Control": boardCacheControl("error") } }
    );
  }
}
