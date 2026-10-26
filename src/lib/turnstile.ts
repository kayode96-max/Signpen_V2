/**
 * Captcha is on only when both the server secret and the public site key
 * are set. One key, or neither, leaves Turnstile off. The full verify path
 * stays in the server and the widget stays in the client, so setting both
 * keys turns it back on with no code change.
 */
export const TURNSTILE_DISABLED_WARNING =
  '[turnstile] disabled: keys not set, relying on device session + hashed-IP limit + anon auth rate limit';

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isTurnstileEnabled(): boolean {
  return (
    nonEmpty(process.env.TURNSTILE_SECRET_KEY) &&
    nonEmpty(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  );
}

let turnstileDisabledWarningLogged = false;

/** One warning per server process. Never include key material. */
export function warnTurnstileDisabledOnce(): void {
  if (isTurnstileEnabled() || turnstileDisabledWarningLogged) return;
  turnstileDisabledWarningLogged = true;
  console.warn(TURNSTILE_DISABLED_WARNING);
}

export function resetTurnstileDisabledWarningForTests(): void {
  turnstileDisabledWarningLogged = false;
}
