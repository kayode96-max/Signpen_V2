/** Successful public board payload. */
export const BOARD_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * Ids that are neither a uuid nor a future slug. Safe to cache the 404 briefly.
 */
export const BOARD_INVALID_ID_CACHE_CONTROL = "public, s-maxage=60";

/**
 * Lookup failures and well-formed ids with no board (unknown uuid, or a slug
 * this release cannot resolve). A board may appear a moment later, so this
 * must not be stored.
 */
export const BOARD_NO_STORE = "no-store";

/**
 * Case/whitespace redirect. Short public cache and no shared-cache lifetime,
 * so it is not the board payload cache. The target URL is deterministic.
 */
export const BOARD_REDIRECT_CACHE_CONTROL = "public, max-age=60";

export type BoardCacheOutcome = "success" | "error" | "invalid-id" | "unknown-board";

export function boardCacheControl(outcome: BoardCacheOutcome): string {
  if (outcome === "success") return BOARD_CACHE_CONTROL;
  if (outcome === "invalid-id") return BOARD_INVALID_ID_CACHE_CONTROL;
  return BOARD_NO_STORE;
}

/** Refetch the cached board route about two seconds after a realtime event or focus. */
export const SIGNATURE_REFRESH_DEBOUNCE_MS = 2000;

/** Used only when the live subscription cannot be opened. */
export const SIGNATURE_POLL_MS = 30_000;

export function signatureChannelFailed(status: string): boolean {
  return status === "CHANNEL_ERROR" || status === "TIMED_OUT";
}

export interface PublicSignature {
  id: string;
  signatureImageUrl: string;
  position: { x: number; y: number };
  signatoryName: string;
  /** Null when the row is private. A leaked private note is never kept. */
  signatoryNote: string | null;
  isPrivate: boolean;
}

export function graduateFirstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || "them";
}

export function privateNoteLine(graduateName: string): string {
  return `Message for ${graduateFirstName(graduateName)} only`;
}

/**
 * Rows from signatures_public(p_id).
 * Note key is signatoryNote (null when private). Privacy key is is_private.
 * Hidden rows are absent from that RPC; a hidden_by_owner flag is dropped.
 */
export function mapSignaturesPublic(data: unknown): PublicSignature[] {
  const rows = Array.isArray(data) ? data : [];
  return rows.flatMap((row) => {
    const mapped = mapSignatureRow(row);
    return mapped ? [mapped] : [];
  });
}

function mapSignatureRow(row: unknown): PublicSignature | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (record.hidden_by_owner === true) return null;
  if (typeof record.id !== "string" || record.id.length === 0) return null;
  if (typeof record.signatureImageUrl !== "string" || record.signatureImageUrl.length === 0) return null;
  if (!record.position || typeof record.position !== "object") return null;

  const point = record.position as Record<string, unknown>;
  const x = typeof point.x === "number" ? point.x : Number(point.x);
  const y = typeof point.y === "number" ? point.y : Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const isPrivate = record.is_private === true;
  const note = typeof record.signatoryNote === "string" ? record.signatoryNote : null;
  return {
    id: record.id,
    signatureImageUrl: record.signatureImageUrl,
    position: { x, y },
    signatoryName: typeof record.signatoryName === "string" ? record.signatoryName : "",
    signatoryNote: isPrivate ? null : note,
    isPrivate,
  };
}

export function signatureDetail(
  signature: Pick<PublicSignature, "signatoryName" | "signatoryNote" | "isPrivate">,
  graduateName: string
): { name: string; text: string } {
  return {
    name: signature.signatoryName,
    text: signature.isPrivate ? privateNoteLine(graduateName) : signature.signatoryNote ?? "",
  };
}
