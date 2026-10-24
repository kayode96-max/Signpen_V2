import { NextRequest, NextResponse } from 'next/server';
import { requireRealUser } from '@/lib/security/access';
import {
  AccountDeletionError,
  accountAdminFromSupabase,
  deleteOwnedAccount,
} from '@/lib/server/delete-account';
import { requireRequestUser } from '@/lib/server/session';
import { createServiceClient, MissingServerConfigError } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deletes the signed-in account and only that account's data.
 * Anonymous sessions are rejected. The user id comes from the verified JWT,
 * never from the request body.
 */
export async function DELETE(req: NextRequest) {
  const session = await requireRequestUser(req);
  if (!session.ok) return session.response;

  const access = requireRealUser(session.user);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const service = createServiceClient();
    await deleteOwnedAccount(accountAdminFromSupabase(service), access.userId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof AccountDeletionError) {
      console.error('Account deletion stopped.', err.step);
      return NextResponse.json(
        { error: 'Account deletion failed before it finished. Sign in and try again.' },
        { status: 500 }
      );
    }
    console.error('Unexpected account deletion error.');
    return NextResponse.json(
      { error: 'Account deletion failed before it finished. Sign in and try again.' },
      { status: 500 }
    );
  }
}
