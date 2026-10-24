import { NextResponse } from 'next/server';

/**
 * GET answers that vary by Authorization. One helper so every status is
 * private and uncached: no shared s-maxage, no store.
 */
export function privateNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
