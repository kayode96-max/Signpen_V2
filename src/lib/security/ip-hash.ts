import { createHmac } from 'node:crypto';
import { IP_HASH_SALT_MIN } from '@/lib/security/limits';

/**
 * HMAC-SHA256 of a visitor IP. The salt stays in IP_HASH_SALT on the server.
 * The digest is not reversible and is safe to store. Never persist the raw IP.
 */
export function hashIp(ip: string, salt: string): string {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Cannot hash an empty IP address.');
  }
  if (!salt || salt.trim().length < IP_HASH_SALT_MIN) {
    throw new Error(`IP_HASH_SALT must be at least ${IP_HASH_SALT_MIN} characters.`);
  }
  return createHmac('sha256', salt).update(normalized).digest('hex');
}

type HeaderSource = { get(name: string): string | null };

/**
 * First hop of x-forwarded-for, then x-real-ip.
 * ASSUMPTION: on Vercel the platform sets x-forwarded-for and the left-most
 * address is the visitor. A value the client forges is only trustworthy
 * because the platform overwrites that header.
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
