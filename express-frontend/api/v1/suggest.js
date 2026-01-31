// Vercel Edge Function for IME suggestions with caching
// This runs at the edge (closest to user) and routes to nearest backend

export const config = {
  runtime: 'edge',
  regions: ['bom1', 'iad1'], // Mumbai + US East for global coverage
};

// Multi-region backend URLs
const BACKENDS = {
  'bom1': 'https://prooftamil-backend-991187041222.asia-south1.run.app',
  'iad1': 'https://prooftamil-backend-us-991187041222.us-central1.run.app',
  'default': 'https://prooftamil-backend-991187041222.asia-south1.run.app',
};

const CACHE_TTL = 120; // 2 minutes

// Get the closest backend based on Vercel region
function getBackendUrl(request) {
  // Vercel sets this header to indicate which region is serving the request
  const region = request.headers.get('x-vercel-id')?.split('::')[0] || 'default';
  
  // Map Vercel regions to our backends
  if (region.startsWith('bom') || region.startsWith('sin') || region.startsWith('hkg')) {
    return BACKENDS['bom1']; // Asia regions → Mumbai backend
  } else if (region.startsWith('iad') || region.startsWith('sfo') || region.startsWith('pdx')) {
    return BACKENDS['iad1']; // US regions → US Central backend
  }
  
  return BACKENDS['default'];
}

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

  // Build backend URL - route to closest region
  const backendBase = getBackendUrl(request);
  const backendUrl = `${backendBase}/api/v1/suggest?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${limit}`;

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

    // Determine which backend was used for debugging
    const backendRegion = backendBase.includes('us-central1') ? 'us-central1' : 'asia-south1';
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=60, s-maxage=${CACHE_TTL}, stale-while-revalidate=300`,
        'CDN-Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Edge-Fetch-Time': `${fetchTime}ms`,
        'X-Backend-Region': backendRegion,
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
