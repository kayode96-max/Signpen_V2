type HeaderSource = { get(name: string): string | null };

/**
 * First hop of x-forwarded-for, then x-real-ip.
 * ASSUMPTION: on Vercel the platform sets x-forwarded-for and the left-most
 * address is the visitor. A value the client forges is only trustworthy
 * because the platform overwrites that header.
 *
 * The address is passed only to service-role RPCs (insert_signature,
 * signature_challenge_required, insert_feedback). Postgres hashes it with
 * private.hash_ip (salted SHA-256, salt kept in private.app_config) and
 * stores only the hash. Never log it or return it to the browser.
 */
export function getClientIp(headers: HeaderSource): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip')?.trim();
  return real || null;
}
