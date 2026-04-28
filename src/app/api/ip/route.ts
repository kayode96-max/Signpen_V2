import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const rustBackendUrl = process.env.RUST_BACKEND_URL;
  if (!rustBackendUrl) {
    return NextResponse.json({ error: 'IP backend is not configured.' }, { status: 503 });
  }

  try {
    const upstream = await fetch(`${rustBackendUrl}/api/ip`, {
      headers: {
        'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
        'x-real-ip': req.headers.get('x-real-ip') ?? '',
      },
      cache: 'no-store',
    });

    const text = await upstream.text();
    const payload = text ? JSON.parse(text) : {};

    if (!upstream.ok) {
      const message = payload?.error ?? 'IP backend request failed.';
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'IP backend is unavailable.' }, { status: 502 });
  }
}
