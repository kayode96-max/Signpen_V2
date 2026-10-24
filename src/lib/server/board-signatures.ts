import { unstable_cache } from "next/cache";
import { boardCacheTag } from "@/lib/cache/board";
import { mapSignaturesPublic, type PublicSignature } from "@/lib/public/board-signatures";
import { normalizeBoardId } from "@/lib/public/student-public";
import { supabase } from "@/supabase/config";

/**
 * signatures_public(p_id). Throws on a failed read so the caller can skip
 * unstable_cache. A thrown or failed fetch must not be stored under the board tag.
 */
export async function readPublicSignatures(studentId: string): Promise<PublicSignature[]> {
  const id = normalizeBoardId(studentId);
  const { data, error } = await supabase.rpc("signatures_public", { p_id: id });
  if (error) throw new Error(error.message);
  return mapSignaturesPublic(data);
}

/**
 * Caches only a successful read. The callback throws when the RPC fails, and
 * unstable_cache stores a value only after the callback returns.
 * The alias RPC is not called.
 */
export function getCachedBoardSignatures(
  studentId: string,
  tag: string = boardCacheTag(studentId)
): Promise<PublicSignature[]> {
  const id = normalizeBoardId(studentId);
  return unstable_cache(
    async () => readPublicSignatures(id),
    ["signatures-public", id],
    { revalidate: 60, tags: [tag] }
  )();
}
