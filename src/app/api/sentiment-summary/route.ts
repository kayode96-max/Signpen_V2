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

  const googleApiKey = process.env.GOOGLE_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!googleApiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_API_KEY is not configured on the server.' },
      { status: 503 }
    );
  }

  // Build prompt
  let prompt = "Summarize the overall sentiment expressed in the following signatures. Focus on identifying and articulating overarching emotional trends and key sentiments.\nSignatures:\n";
  for (const sig of signatures) {
    prompt += `- ${sig}\n`;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${googleApiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API call failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to generate sentiment summary from Google Gemini.' },
        { status: response.status }
      );
    }

    const payload = await response.json();
    const summary = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!summary) {
      return NextResponse.json(
        { error: 'Gemini returned an empty summary response.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ summary });
  } catch (err: any) {
    console.error('Error in sentiment summary handler:', err);
    return NextResponse.json(
      { error: 'Sentiment service is currently unavailable.' },
      { status: 502 }
    );
  }
}
