import { NextRequest, NextResponse } from 'next/server';

export function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  return NextResponse.json({ ip });
}
