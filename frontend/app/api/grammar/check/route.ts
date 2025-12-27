import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const text = searchParams.get('text');

  if (!text || text.trim().length < 10) {
    return NextResponse.json({ issues: [] });
  }

  try {
    // Proxy to backend proofreading service
    // Replace with your actual backend URL
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
    const response = await fetch(
      `${backendUrl}/api/v1/grammar/check?text=${encodeURIComponent(text)}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      // If backend doesn't have this endpoint yet, return empty issues
      if (response.status === 404) {
        return NextResponse.json({ issues: [] });
      }
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    // Transform backend response to expected format
    // Expected: { issues: [{ start, end, type, message }] }
    const issues =
      data.issues?.map((issue: any) => ({
        start: issue.start ?? issue.from ?? 0,
        end: issue.end ?? issue.to ?? 0,
        type: issue.type || 'grammar',
        message: issue.message || issue.reason || '',
      })) || [];

    return NextResponse.json({ issues });
  } catch (error) {
    console.error('[Grammar API] Error:', error);
    // Return empty issues on error (graceful degradation)
    return NextResponse.json({ issues: [] });
  }
}

