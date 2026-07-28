import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Supabase credentials are not configured on the server.' },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized: Session authorization header is missing.' },
      { status: 401 }
    );
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Create user-authenticated client using the client bearer token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // 1. Verify token & session validity
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error('Supabase session verification failed:', authError);
      return NextResponse.json(
        { error: 'Unauthorized: Could not verify your session.' },
        { status: 401 }
      );
    }

    // 2. Extract visitor IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
               req.headers.get('x-real-ip') || 
               '127.0.0.1';

    // 3. Query signed_ips to check for duplicates
    const { data: existingIps, error: checkError } = await userClient
      .from('signed_ips')
      .select('*')
      .eq('studentId', body.studentId)
      .eq('ipAddress', ip);

    if (checkError) {
      console.error('Failed to query signed_ips table:', checkError);
      return NextResponse.json(
        { error: 'Failed to verify signing history.' },
        { status: 500 }
      );
    }

    if (existingIps && existingIps.length > 0) {
      return NextResponse.json(
        { error: 'You have already signed this board from this IP.' },
        { status: 409 }
      );
    }

    // 4. Save signature in the database
    const { data: signature, error: sigError } = await userClient
      .from('signatures')
      .insert({
        studentId: body.studentId,
        signatureImageUrl: body.signatureImageUrl,
        signatoryName: body.signatoryName,
        signatoryNote: body.signatoryNote,
        position: body.position,
      })
      .select()
      .single();

    if (sigError) {
      console.error('Failed to insert row into signatures table:', sigError);
      return NextResponse.json(
        { error: 'Failed to record signature.' },
        { status: 500 }
      );
    }

    // 5. Track client IP in signed_ips to prevent spam
    const { error: ipInsertError } = await userClient
      .from('signed_ips')
      .insert({
        studentId: body.studentId,
        ipAddress: ip,
      });

    if (ipInsertError) {
      // Log error but do not fail the request since signature is already recorded
      console.warn('Failed to insert row into signed_ips table:', ipInsertError);
    }

    return NextResponse.json({ signature_id: signature.id }, { status: 201 });
  } catch (err: any) {
    console.error('Unexpected error in signatures handler:', err);
    return NextResponse.json(
      { error: 'Internal server error while processing signature.' },
      { status: 500 }
    );
  }
}
