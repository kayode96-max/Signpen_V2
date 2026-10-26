import { notFound } from "next/navigation";
import PublicSignOutPage from "@/components/signature/public-sign-out-page";
import { supabase } from "@/supabase/config";

// Canonical 8-4-4-4-12 hex id. Anything else — garbage, non-UUID, or a very
// long segment — is a 404 before we touch the database.
const STUDENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StudentPageProps = {
  params: Promise<{ studentId: string }>;
};

export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: StudentPageProps) {
  const { studentId } = await params;

  if (typeof studentId !== "string" || !STUDENT_ID_PATTERN.test(studentId)) {
    notFound();
  }

  // students is owner-only after the RLS lockdown, so the public existence
  // check goes through get_student_public. That RPC returns id, name, photo,
  // and page settings — never email. A query error is not a missing row:
  // fall through so a network blip does not hide a real board.
  let missing = false;
  try {
    const { data, error } = await supabase
      .rpc("get_student_public", { p_id: studentId })
      .maybeSingle();

    if (error) {
      console.error("Student lookup failed:", error.message);
    } else if (data == null) {
      missing = true;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown student lookup error";
    console.error("Student lookup failed:", message);
  }

  if (missing) {
    notFound();
  }

  return <PublicSignOutPage />;
}
