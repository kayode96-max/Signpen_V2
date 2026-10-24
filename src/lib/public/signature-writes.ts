export const HIDE_UPDATE_FAILED_COPY =
  "Couldn't update. Check your connection and try again.";

export const EDITS_CLOSED_COPY = "Edits close 24 hours after signing";

export interface OwnSignaturePatch {
  signatoryName: string;
  signatoryNote: string;
  privateBySigner: boolean;
}

export type SignatureWriteResult =
  | { ok: true }
  | { ok: false; closed: boolean };

async function writeSignature(
  id: string,
  method: "PATCH" | "DELETE",
  token: string,
  body: unknown | undefined,
  fetchImpl: typeof fetch
): Promise<SignatureWriteResult> {
  try {
    const response = await fetchImpl(`/api/signatures/${id}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.ok) return { ok: true };
    return { ok: false, closed: response.status === 403 };
  } catch {
    return { ok: false, closed: false };
  }
}

/** Owner hide/unhide. The body changes only hidden_by_owner. */
export function patchHiddenByOwner(
  id: string,
  hidden: boolean,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<SignatureWriteResult> {
  return writeSignature(id, "PATCH", token, { hidden_by_owner: hidden }, fetchImpl);
}

/** Signer edit inside the 24 hour window. */
export function patchOwnSignature(
  id: string,
  patch: OwnSignaturePatch,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<SignatureWriteResult> {
  return writeSignature(id, "PATCH", token, patch, fetchImpl);
}

export function deleteOwnSignature(
  id: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<SignatureWriteResult> {
  return writeSignature(id, "DELETE", token, undefined, fetchImpl);
}
