/**
 * Public board identity from get_student_public(p_id).
 * The RPC returns id, name, profilePhotoUrl, pageSettings, popupMessageConfig.
 * Email is not part of that shape and must not be read here.
 */

export const STUDENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Future public slugs. Lookup is not wired in this release. */
export const BOARD_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const BOARD_SLUG_MIN_LENGTH = 3;
export const BOARD_SLUG_MAX_LENGTH = 30;

export function isStudentId(value: string): boolean {
  return STUDENT_ID_PATTERN.test(value);
}

/** Trimmed lowercase form used for lookup, cache tags, and canonical URLs. */
export function normalizeBoardId(value: string): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/**
 * Public shirt URL for copy, share sheets, QR, and any other outbound link.
 * Uses the same trim and lowercase as boardIdKind so the link is already
 * canonical and does not depend on the 308 redirect.
 */
export function boardUrl(id: string, origin: string): string {
  const boardId = normalizeBoardId(id);
  const base = origin.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(boardId)}`;
}

/**
 * Lowercase id to redirect to, or null when the raw segment is already canonical.
 * Blank input is not a redirect target.
 */
export function canonicalBoardId(value: string): string | null {
  if (typeof value !== "string") return null;
  const id = normalizeBoardId(value);
  if (id.length === 0 || id === value) return null;
  return id;
}

export function shirtCanonicalPath(
  rawId: string,
  searchParams: Record<string, string | string[] | undefined>
): string | null {
  const id = canonicalBoardId(rawId);
  if (!id) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.append(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    }
  }
  const query = params.toString();
  return `/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
}

/** Absolute signatures URL with the original query string preserved. */
export function signaturesCanonicalUrl(requestUrl: string, rawId: string): string | null {
  const id = canonicalBoardId(rawId);
  if (!id) return null;
  const url = new URL(requestUrl);
  url.pathname = `/api/boards/${encodeURIComponent(id)}/signatures`;
  return url.toString();
}

export function isBoardSlug(value: string): boolean {
  return (
    value.length >= BOARD_SLUG_MIN_LENGTH &&
    value.length <= BOARD_SLUG_MAX_LENGTH &&
    BOARD_SLUG_PATTERN.test(value)
  );
}

export type BoardIdKind = "uuid" | "slug" | "invalid";

/**
 * One classifier for public board ids. The id is trimmed and lowercased first,
 * so ABCDEF01-... is a uuid and Chinwe-2026 is the slug chinwe-2026.
 * A uuid is checked first: a lowercase uuid also matches the slug character
 * rule, but it is 36 characters and is never a slug.
 * Anything that is neither is safe to cache as a 404. A slug is well-formed
 * and must not be sent to get_student_public, which still takes p_id.
 */
export function boardIdKind(value: string): BoardIdKind {
  const id = normalizeBoardId(value);
  if (id.length === 0) return "invalid";
  if (isStudentId(id)) return "uuid";
  if (isBoardSlug(id)) return "slug";
  return "invalid";
}

export interface PublicStudent {
  id: string;
  name: string;
  profilePhotoUrl: string;
  pageSettings: {
    theme: "light" | "dark";
    pageHeading: string;
    pageSubheading: string;
    backgroundImageUrl?: string;
  };
  popupMessageConfig: {
    title: string;
    message: string;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export type StudentLookup =
  | { kind: "found"; student: PublicStudent }
  | { kind: "missing" }
  | { kind: "failed" };

/**
 * Empty get_student_public is a missing board (the page calls notFound()).
 * A transport or query error is not a missing board: the page stays up.
 */
export function classifyStudentLookup(
  error: { message?: string } | null | undefined,
  data: unknown
): StudentLookup {
  if (error) return { kind: "failed" };
  const student = publicStudentFromRpc(data);
  if (!student) return { kind: "missing" };
  return { kind: "found", student };
}

/** One row, or null when the RPC returned no board. */
export function publicStudentFromRpc(data: unknown): PublicStudent | null {
  const row = Array.isArray(data) ? data[0] : data;
  const student = asRecord(row);
  if (!student || typeof student.id !== "string") return null;
  const id = normalizeBoardId(student.id);
  if (!isStudentId(id)) return null;

  const settings = asRecord(student.pageSettings) ?? {};
  const popup = asRecord(student.popupMessageConfig) ?? {};

  return {
    id,
    name: asText(student.name),
    profilePhotoUrl: asText(student.profilePhotoUrl),
    pageSettings: {
      theme: settings.theme === "light" ? "light" : "dark",
      pageHeading: asText(settings.pageHeading),
      pageSubheading: asText(settings.pageSubheading),
      backgroundImageUrl: asText(settings.backgroundImageUrl),
    },
    popupMessageConfig: {
      title: asText(popup.title),
      message: asText(popup.message),
    },
  };
}
