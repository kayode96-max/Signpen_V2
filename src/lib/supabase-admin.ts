import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service role key.
 * Import only from route handlers / server code. SUPABASE_SERVICE_ROLE_KEY has no
 * NEXT_PUBLIC_ prefix, so Next.js never inlines it into a browser bundle.
 * Returns null when the key is not configured.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseAdmin must only be called on the server.');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
