// Vercel Edge Function for IME suggestions with caching
// This runs at the edge (closest to user) and caches responses

export const config = {
  runtime: 'edge',
  regions: ['bom1'], // Mumbai - same as Cloud Run
};

const BACKEND_URL = 'https://prooftamil-backend-991187041222.asia-south1.run.app';
const CACHE_TTL = 120; // 2 minutes

export default async function handler(request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const mode = url.searchParams.get('mode') || 'spoken';
  const limit = url.searchParams.get('limit') || '8';

  // Quick validation
  if (!q || q.length === 0) {
    return new Response(
      JSON.stringify({ success: true, suggestions: [], error: 'Query required' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );
  }

  // Build backend URL
  const backendUrl = `${BACKEND_URL}/api/v1/suggest?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${limit}`;

  try {
    const startTime = Date.now();
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Enable caching at the edge
      cf: {
        cacheTtl: CACHE_TTL,
        cacheEverything: true,
      },
    });

    const data = await response.json();
    const fetchTime = Date.now() - startTime;

    // Add edge timing to response
    if (data.timing) {
      data.timing.edge_fetch_ms = fetchTime;
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=60, s-maxage=${CACHE_TTL}, stale-while-revalidate=300`,
        'CDN-Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Edge-Fetch-Time': `${fetchTime}ms`,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, suggestions: [], error: 'Backend unavailable' }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );
  }
}
