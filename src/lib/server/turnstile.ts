export interface TurnstileVerdict {
  success?: boolean;
}

/** Cloudflare siteverify success is only true when the boolean is exactly true. */
export function interpretTurnstile(payload: TurnstileVerdict | null | undefined): boolean {
  return payload?.success === true;
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true } | { ok: false; status: 400 | 502 | 503; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: 'TURNSTILE_SECRET_KEY is not configured on the server.',
    };
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);

  let response: Response;
  try {
    response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return { ok: false, status: 502, error: 'Could not reach the Turnstile verification service.' };
  }

  if (!response.ok) {
    return { ok: false, status: 502, error: 'Turnstile verification failed.' };
  }

  let payload: TurnstileVerdict | null = null;
  try {
    payload = (await response.json()) as TurnstileVerdict;
  } catch {
    return { ok: false, status: 502, error: 'Turnstile verification returned an unreadable response.' };
  }

  if (!interpretTurnstile(payload)) {
    return { ok: false, status: 400, error: 'Turnstile verification failed. Please try again.' };
  }
  return { ok: true };
}
