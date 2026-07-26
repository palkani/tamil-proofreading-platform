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

  // ── v2 IME suggest (flag-gated by SUGGEST_V2_BASE) ────────────────────────
  // When set (e.g. https://api.prooftamil.com), try v2 once; v2 and v1 return the
  // same { suggestions:[{word,score}] } shape, so it's transparent to the client.
  // On ANY problem we fall through to the regional v1 flow below — v2 can't break
  // the IME. NOTE: v2 is single-region (asia-south1); enabling this adds cross-region
  // latency per keystroke for US traffic, so enable deliberately and measure.
  const V2_BASE = (typeof process !== 'undefined' && process.env && process.env.SUGGEST_V2_BASE) || '';
  if (V2_BASE) {
    try {
      const v2Url = `${V2_BASE.replace(/\/+$/, '')}/api/v1/suggest?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${limit}`;
      const r = await fetch(v2Url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
      });
      if (r.status === 200) {
        const data = await r.json();
        if (data && Array.isArray(data.suggestions)) {
          // v2 returns { query, suggestions:[{word,score}] }; v1's client also expects
          // success:true. Normalise so the shape matches v1 exactly.
          const out = { success: true, ...data };
          return new Response(JSON.stringify(out), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=60, s-maxage=${CACHE_TTL}, stale-while-revalidate=300`,
              'CDN-Cache-Control': `public, max-age=${CACHE_TTL}`,
              'X-Backend-Region': 'v2',
            },
          });
        }
      }
      // non-200 or unexpected shape → fall through to v1
    } catch (_e) {
      // v2 unreachable → fall through to v1
    }
  }

  // Build backend URL - route to closest region
  const backendBase = getBackendUrl(request);
  const backendUrl = `${backendBase}/api/v1/suggest?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${limit}`;

  const maxRetries = 4;
  const retryDelayMs = 1000;

  try {
    const startTime = Date.now();
    let response;
    let lastStatus = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      response = await fetch(backendUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        cf: {
          cacheTtl: CACHE_TTL,
          cacheEverything: true,
        },
      });
      lastStatus = response.status;
      if (response.status !== 503) break;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }

    const data = lastStatus === 503
      ? { success: true, suggestions: [], source: 'backend_starting' }
      : await response.json();
    const fetchTime = Date.now() - startTime;

    if (data.timing) {
      data.timing.edge_fetch_ms = fetchTime;
    }

    const backendRegion = backendBase.includes('us-central1') ? 'us-central1' : 'asia-south1';
    const status = lastStatus === 503 ? 200 : response.status;

    return new Response(JSON.stringify(data), {
      status,
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
