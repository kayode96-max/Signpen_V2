import { NextRequest, NextResponse } from 'next/server';

type SignatureCreateRequest = {
  studentId?: string;
  signatureImageUrl?: string;
  signatoryName?: string;
  signatoryNote?: string;
  position?: {
    x?: number;
    y?: number;
  };
};

export async function POST(req: NextRequest) {
  let body: SignatureCreateRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.studentId || !body.signatureImageUrl || !body.signatoryName || !body.signatoryNote) {
    return NextResponse.json(
      { error: 'Missing required signature fields.' },
      { status: 400 }
    );
  }

  if (
    typeof body.position?.x !== 'number' ||
    typeof body.position?.y !== 'number'
  ) {
    return NextResponse.json(
      { error: 'position.x and position.y must be numbers.' },
      { status: 400 }
    );
  }

  const rustBackendUrl = process.env.RUST_BACKEND_URL;
  if (!rustBackendUrl) {
    return NextResponse.json(
      { error: 'Signature backend is not configured.' },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';

  try {
    const upstream = await fetch(`${rustBackendUrl}/api/signatures`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: authHeader,
        'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
        'x-real-ip': req.headers.get('x-real-ip') ?? '',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const text = await upstream.text();
    const payload = text ? JSON.parse(text) : {};

    if (!upstream.ok) {
      const message = payload?.error ?? 'Signature backend request failed.';
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    return NextResponse.json(payload, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Signature backend is unavailable.' },
      { status: 502 }
    );
  }
}
