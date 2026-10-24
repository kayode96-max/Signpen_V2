import { describe, expect, it } from 'vitest';
import { getClientIp } from '@/lib/security/client-ip';

describe('getClientIp', () => {
  it('uses the first forwarded hop and ignores the rest', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.4' });
    expect(getClientIp(headers)).toBe('203.0.113.10');
  });

  it('falls back to x-real-ip and returns null when both are missing', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '198.51.100.8' }))).toBe('198.51.100.8');
    expect(getClientIp(new Headers())).toBeNull();
  });

  it('trims whitespace and ignores an empty forwarded header', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '  2001:db8::1 , 10.0.0.4' }))).toBe('2001:db8::1');
    expect(getClientIp(new Headers({ 'x-forwarded-for': ' ', 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
  });
});
