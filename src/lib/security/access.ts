/**
 * Pure auth decisions for the deletion and sentiment routes.
 * Anonymous Supabase sessions are role "authenticated" with is_anonymous.
 * They must never receive owner rights.
 */

export interface SessionUser {
  id: string;
  isAnonymous: boolean;
}

export type AccessDenied = { ok: false; status: 401 | 403; error: string };
export type AccessGranted = { ok: true; userId: string };
export type AccessDecision = AccessDenied | AccessGranted;

const UNAUTHORIZED: AccessDenied = {
  ok: false,
  status: 401,
  error: 'Unauthorized: Could not verify your session.',
};

const ANONYMOUS: AccessDenied = {
  ok: false,
  status: 403,
  error: 'Anonymous sessions cannot perform this action.',
};

export function readIsAnonymous(user: {
  is_anonymous?: boolean | null;
  app_metadata?: { provider?: string; providers?: string[] } | null;
}): boolean {
  if (user.is_anonymous === true) return true;
  const provider = user.app_metadata?.provider;
  if (provider === 'anonymous') return true;
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.length > 0 && providers.every((p) => p === 'anonymous')) {
    return true;
  }
  return false;
}

/** Signed-in, non-anonymous account. Used by account deletion. */
export function requireRealUser(user: SessionUser | null): AccessDecision {
  if (!user?.id) return UNAUTHORIZED;
  if (user.isAnonymous) return ANONYMOUS;
  return { ok: true, userId: user.id };
}

/**
 * Sentiment summaries are for the caller's own board.
 * students.id is the owner's auth user id. A requested id that does not
 * match the session is rejected. Omitting the id means "my board".
 */
export function requireOwnBoard(
  user: SessionUser | null,
  requestedBoardId?: string | null
): AccessDecision {
  const real = requireRealUser(user);
  if (!real.ok) return real;
  if (requestedBoardId && requestedBoardId !== real.userId) {
    return {
      ok: false,
      status: 403,
      error: 'You can only do this for your own board.',
    };
  }
  return real;
}
