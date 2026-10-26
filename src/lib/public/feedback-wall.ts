import { supabase } from "@/supabase/config";

/** feedback_public columns. Email is not on the view and must not be selected. */
export const FEEDBACK_PUBLIC_COLUMNS = "id, first_name, message, type, rating, created_at";

export const FEEDBACK_POLL_MS = 30_000;

export interface PublicFeedbackItem {
  id: string;
  first_name: string;
  message: string;
  type: "comment" | "review" | "inquiry";
  rating: number | null;
  created_at: string;
}

const FEEDBACK_TYPES = new Set(["comment", "review", "inquiry"]);

export function mapFeedbackRow(row: unknown): PublicFeedbackItem | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.message !== "string") return null;
  if (typeof record.type !== "string" || !FEEDBACK_TYPES.has(record.type)) return null;
  if (typeof record.created_at !== "string") return null;

  const rating =
    typeof record.rating === "number" && Number.isFinite(record.rating) ? record.rating : null;

  return {
    id: record.id,
    first_name: typeof record.first_name === "string" ? record.first_name : "",
    message: record.message,
    type: record.type as PublicFeedbackItem["type"],
    rating,
    created_at: record.created_at,
  };
}

export async function fetchFeedbackWall(): Promise<PublicFeedbackItem[]> {
  const { data, error } = await supabase
    .from("feedback_public")
    .select(FEEDBACK_PUBLIC_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const mapped = mapFeedbackRow(row);
    return mapped ? [mapped] : [];
  });
}
