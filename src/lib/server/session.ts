import { NextRequest, NextResponse } from 'next/server';
import { readIsAnonymous, type SessionUser } from '@/lib/security/access';
import { createUserClient, MissingServerConfigError } from '@/lib/server/supabase';

export type SessionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export async function requireRequestUser(req: NextRequest): Promise<SessionResult> {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Session authorization header is missing.' },
        { status: 401 }
      ),
    };
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Session authorization header is missing.' },
        { status: 401 }
      ),
    };
  }

  try {
    const client = createUserClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Unauthorized: Could not verify your session.' },
          { status: 401 }
        ),
      };
    }
    return {
      ok: true,
      user: {
        id: data.user.id,
        isAnonymous: readIsAnonymous(data.user),
      },
    };
  } catch (err) {
    if (err instanceof MissingServerConfigError) {
      return {
        ok: false,
        response: NextResponse.json({ error: err.message }, { status: 503 }),
      };
    }
    throw err;
  }
}
