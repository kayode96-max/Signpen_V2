import { describe, expect, it } from 'vitest';
import { getClientIp, hashIp } from '@/lib/security/ip-hash';

const SALT = 'preview-salt-value-01';
const OTHER_SALT = 'production-salt-value';

describe('hashIp', () => {
  it('is stable and does not embed the raw address', () => {
    const ip = '203.0.113.10';
    const first = hashIp(ip, SALT);
    expect(hashIp(ip, SALT)).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain(ip);
    expect(first).not.toBe(ip);
  });

  it('changes when the salt changes and folds IPv6 case', () => {
    expect(hashIp('2001:db8::1', SALT)).not.toBe(hashIp('2001:db8::1', OTHER_SALT));
    expect(hashIp('2001:DB8::1', SALT)).toBe(hashIp('2001:db8::1', SALT));
  });

  it('rejects an empty address or a short salt', () => {
    expect(() => hashIp('   ', SALT)).toThrow(/empty/i);
    expect(() => hashIp('203.0.113.10', 'short')).toThrow(/IP_HASH_SALT/);
  });
});

describe('getClientIp', () => {
  it('uses the first forwarded hop and ignores the rest', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.4' });
    expect(getClientIp(headers)).toBe('203.0.113.10');
  });

  it('falls back to x-real-ip and returns null when both are missing', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '198.51.100.8' }))).toBe('198.51.100.8');
    expect(getClientIp(new Headers())).toBeNull();
  });
});
