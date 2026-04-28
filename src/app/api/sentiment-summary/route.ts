import { NextRequest, NextResponse } from 'next/server';

type SentimentSummaryBody = {
  signatures?: string[];
};

export async function POST(req: NextRequest) {
  let body: SentimentSummaryBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const signatures = Array.isArray(body.signatures) ? body.signatures : [];

  if (signatures.length === 0) {
    return NextResponse.json(
      { error: 'signatures must contain at least one item.' },
      { status: 400 }
    );
  }

  const rustBackendUrl = process.env.RUST_BACKEND_URL;
  if (!rustBackendUrl) {
    return NextResponse.json(
      { error: 'Sentiment backend is not configured.' },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(`${rustBackendUrl}/api/sentiment-summary`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ signatures }),
      cache: 'no-store',
    });

    const text = await upstream.text();
    const payload = text ? JSON.parse(text) : {};

    if (!upstream.ok) {
      const message = payload?.error ?? 'Sentiment backend request failed.';
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: 'Sentiment backend is unavailable.' },
      { status: 502 }
    );
  }
}
