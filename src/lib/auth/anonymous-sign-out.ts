/**
 * One local sign-out for an anonymous signer session.
 * A second call with the same access token does not hit /auth/v1/logout
 * again. That repeat is a 403 (session_id already revoked) and the browser
 * logs it even when the client ignores the error.
 */
export function createAnonymousSignOut(deps: {
  getSession: () => Promise<{ accessToken: string | null; isAnonymous: boolean }>;
  signOutLocal: () => Promise<void>;
}): () => Promise<void> {
  let pending: Promise<void> | null = null;
  let kickedToken: string | null = null;

  return function signOutAnonymousSession(): Promise<void> {
    if (pending) return pending;
    pending = (async () => {
      const session = await deps.getSession();
      if (!session.accessToken || !session.isAnonymous) return;
      if (kickedToken === session.accessToken) return;
      kickedToken = session.accessToken;
      await deps.signOutLocal();
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
}
