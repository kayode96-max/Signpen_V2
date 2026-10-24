import {
  classifyStudentLookup,
  isStudentId,
  normalizeBoardId,
  type StudentLookup,
} from "@/lib/public/student-public";
import { supabase } from "@/supabase/config";

/**
 * Uncached get_student_public. A missing row and a failed read must not be
 * written to unstable_cache: a board can be created immediately afterwards.
 * The RPC takes p_id uuid. A slug or junk id is not a query.
 */
export async function lookupPublicStudent(studentId: string): Promise<StudentLookup> {
  const id = normalizeBoardId(studentId);
  if (!isStudentId(id)) return { kind: "missing" };

  try {
    const { data, error } = await supabase.rpc("get_student_public", { p_id: id });
    const lookup = classifyStudentLookup(error, data);
    if (lookup.kind === "failed") {
      console.error("Student lookup failed:", error?.message ?? "unknown");
    }
    return lookup;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown student lookup error";
    console.error("Student lookup failed:", message);
    return { kind: "failed" };
  }
}
