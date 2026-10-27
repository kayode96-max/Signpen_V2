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

/**
 * Browser write to public.students. The lockdown policies allow this only
 * when id = auth.uid() and the JWT is not anonymous. Callers must skip the
 * request when this is not ok, instead of letting Postgres reject it.
 */
export function decideStudentWrite(input: {
  sessionUserId: string | null | undefined;
  isAnonymous: boolean;
  rowId: string | null | undefined;
  merge: boolean;
}):
  | { ok: true; op: 'upsert' | 'update'; id: string }
  | { ok: false; reason: 'signed_out' | 'anonymous' | 'wrong_id' } {
  if (!input.sessionUserId) return { ok: false, reason: 'signed_out' };
  if (input.isAnonymous) return { ok: false, reason: 'anonymous' };
  if (!input.rowId || input.rowId !== input.sessionUserId) return { ok: false, reason: 'wrong_id' };
  return { ok: true, op: input.merge ? 'update' : 'upsert', id: input.sessionUserId };
}

/**
 * /dashboard with an anonymous signer session is signed out: redirect to
 * login and do not create a students row. A real owner with no row yet
 * may create their own.
 */
export function planDashboardStudents(input: {
  user: { id: string; isAnonymous: boolean } | null;
  authReady: boolean;
  studentReady: boolean;
  studentExists: boolean;
}): { redirectToLogin: boolean; signOutAnonymous: boolean; ensureOwnRow: boolean } {
  if (!input.authReady) {
    return { redirectToLogin: false, signOutAnonymous: false, ensureOwnRow: false };
  }
  if (!input.user || input.user.isAnonymous) {
    return {
      redirectToLogin: true,
      signOutAnonymous: Boolean(input.user?.isAnonymous),
      ensureOwnRow: false,
    };
  }
  return {
    redirectToLogin: false,
    signOutAnonymous: false,
    ensureOwnRow: input.studentReady && !input.studentExists,
  };
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
