import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class MissingServerConfigError extends Error {
  readonly envName: string;

  constructor(envName: string) {
    super(`${envName} is not configured on the server.`);
    this.name = 'MissingServerConfigError';
    this.envName = envName;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingServerConfigError(name);
  return value;
}

/**
 * Service-role client. Bypasses RLS. Import only from server route handlers.
 * Reads SUPABASE_SERVICE_ROLE_KEY. Never NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.
 */
export function createServiceClient(): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Anon key plus the caller's JWT, used only to verify the session with GoTrue. */
export function createUserClient(jwt: string): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
