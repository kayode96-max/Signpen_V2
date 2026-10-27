import { describe, expect, it, vi } from 'vitest';
import { createAnonymousSignOut } from '@/lib/auth/anonymous-sign-out';

const TOKEN = 'anon-access-token';

describe('signOutAnonymousSession', () => {
  it('calls local sign-out once for parallel and repeat calls with the same token', async () => {
    const signOutLocal = vi.fn(async () => {});
    const signOut = createAnonymousSignOut({
      getSession: async () => ({ accessToken: TOKEN, isAnonymous: true }),
      signOutLocal,
    });

    await Promise.all([signOut(), signOut()]);
    await signOut();

    expect(signOutLocal).toHaveBeenCalledTimes(1);
  });

  it('does not sign out a real account or a missing session', async () => {
    const signOutLocal = vi.fn(async () => {});
    const real = createAnonymousSignOut({
      getSession: async () => ({ accessToken: 'real-token', isAnonymous: false }),
      signOutLocal,
    });
    await real();

    const missing = createAnonymousSignOut({
      getSession: async () => ({ accessToken: null, isAnonymous: false }),
      signOutLocal,
    });
    await missing();

    expect(signOutLocal).not.toHaveBeenCalled();
  });
});
