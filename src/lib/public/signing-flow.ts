export const TURNSTILE_BEFORE_DRAW_COPY =
  "Lots of people are signing from this network. Quick check that you're not a robot, then you're in.";

export const ALREADY_SIGNED_COPY = "You've already signed this shirt.";

export const CHALLENGE_REQUIRED_ERROR = "challenge_required";

export class SignatureFlowError extends Error {
  readonly code: "challenge_required" | "already_signed";

  constructor(code: SignatureFlowError["code"], message: string) {
    super(message);
    this.name = "SignatureFlowError";
    this.code = code;
  }
}

/**
 * GET /api/signatures/challenge?studentId=<uuid>
 * 200 body: { "challenge_required": boolean }
 * Anything else does not block signing.
 */
export function readChallengeRequired(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { challenge_required?: unknown }).challenge_required === true;
}

/**
 * GET /api/signatures?studentId=<uuid> with the device session.
 * 200 body: { "alreadySigned": boolean }. A missing session or a non-200
 * does not block; POST still returns 409 if this device has signed.
 */
export function readAlreadySigned(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { alreadySigned?: unknown }).alreadySigned === true;
}

export async function fetchAlreadySigned(
  studentId: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetchImpl(
      `/api/signatures?studentId=${encodeURIComponent(studentId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { authorization: `Bearer ${token}` },
      }
    );
  } catch {
    return false;
  }
  if (!response.ok) return false;
  try {
    return readAlreadySigned(await response.json());
  } catch {
    return false;
  }
}

export async function fetchTurnstileRequired(
  studentId: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetchImpl(
      `/api/signatures/challenge?studentId=${encodeURIComponent(studentId)}`,
      { method: "GET", cache: "no-store" }
    );
  } catch {
    return false;
  }

  if (!response.ok) return false;

  try {
    return readChallengeRequired(await response.json());
  } catch {
    return false;
  }
}

/** Any 409 from POST /api/signatures is already-signed. 429 challenge_required asks for Turnstile. */
export function classifySignatureFailure(
  status: number,
  serverMessage?: string
): SignatureFlowError | null {
  if (status === 409) {
    return new SignatureFlowError("already_signed", ALREADY_SIGNED_COPY);
  }
  if (status === 429 && serverMessage === CHALLENGE_REQUIRED_ERROR) {
    return new SignatureFlowError("challenge_required", TURNSTILE_BEFORE_DRAW_COPY);
  }
  return null;
}

export function signatureErrorMessage(status: number, serverMessage?: string): string {
  const classified = classifySignatureFailure(status, serverMessage);
  if (classified) return classified.message;
  if (status === 429) {
    return "Too many signatures from this network right now. Please try again in a little while.";
  }
  if (status === 401) return "We couldn't confirm your session. Refresh the page and try again.";
  if (status === 404) return "This shirt is no longer available.";
  if (status === 503) return "Signing is unavailable right now. Please try again in a few minutes.";
  if (
    status === 400 &&
    serverMessage &&
    serverMessage.length <= 180 &&
    !serverMessage.includes("\n")
  ) {
    return serverMessage;
  }
  return "We couldn't save your signature. Please try again.";
}
