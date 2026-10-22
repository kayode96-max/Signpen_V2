import { describe, expect, it } from 'vitest';
import { readIsAnonymous, requireOwnBoard, requireRealUser, type SessionUser } from '@/lib/security/access';

const owner: SessionUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', isAnonymous: false };
const anon: SessionUser = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isAnonymous: true };
const otherBoard = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('account deletion auth', () => {
  it('rejects a missing session and an anonymous session', () => {
    expect(requireRealUser(null)).toMatchObject({ ok: false, status: 401 });
    expect(requireRealUser(anon)).toMatchObject({ ok: false, status: 403 });
  });

  it('allows a real account and does not take a target id from the caller', () => {
    expect(requireRealUser(owner)).toEqual({ ok: true, userId: owner.id });
  });
});

describe('sentiment summary auth', () => {
  it('allows the owner to summarize only their own board', () => {
    expect(requireOwnBoard(owner, owner.id)).toEqual({ ok: true, userId: owner.id });
    expect(requireOwnBoard(owner, null)).toEqual({ ok: true, userId: owner.id });
    expect(requireOwnBoard(owner, undefined)).toEqual({ ok: true, userId: owner.id });
  });

  it('rejects anonymous sessions and other boards', () => {
    expect(requireOwnBoard(null, owner.id)).toMatchObject({ ok: false, status: 401 });
    expect(requireOwnBoard(anon, anon.id)).toMatchObject({ ok: false, status: 403 });
    expect(requireOwnBoard(owner, otherBoard)).toMatchObject({ ok: false, status: 403 });
  });
});

describe('readIsAnonymous', () => {
  it('treats the Supabase anonymous flag and provider as anonymous', () => {
    expect(readIsAnonymous({ is_anonymous: true })).toBe(true);
    expect(readIsAnonymous({ app_metadata: { provider: 'anonymous' } })).toBe(true);
    expect(readIsAnonymous({ app_metadata: { providers: ['anonymous'] } })).toBe(true);
    expect(readIsAnonymous({ is_anonymous: false, app_metadata: { provider: 'email' } })).toBe(false);
    expect(readIsAnonymous({ app_metadata: { providers: ['email', 'google'] } })).toBe(false);
  });
});
