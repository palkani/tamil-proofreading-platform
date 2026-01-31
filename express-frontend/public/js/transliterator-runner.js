// Shared transliteration helper that targets the Go suggest engine (fast path).
(() => {
  const IS_DEV = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost';
  let lastSuggestions = [];
  
  // OPTIMIZATION: In-memory cache to avoid redundant API calls (target <100ms latency)
  const suggestionCache = new Map();
  const CACHE_TTL_MS = 60 * 1000; // 1 minute cache
  const CACHE_MAX_SIZE = 200; // Max cache entries
  
  function getCached(key) {
    const entry = suggestionCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      suggestionCache.delete(key);
      return null;
    }
    return entry.data;
  }
  
  function setCache(key, data) {
    // Evict oldest entries if cache is full
    if (suggestionCache.size >= CACHE_MAX_SIZE) {
      const oldest = suggestionCache.keys().next().value;
      if (oldest) suggestionCache.delete(oldest);
    }
    suggestionCache.set(key, { data, ts: Date.now() });
  }

  function buildRunnerUrl(params) {
    const qs = new URLSearchParams(params).toString();
    return `/api/v1/suggest?${qs}`;
  }

  async function safeJson(res) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_err) {
      return null;
    }
  }

  async function transliterateViaRunner(text, mode = 'spoken', limit = 8, signal) {
    // OPTIMIZATION: Check in-memory cache first (instant response for cached queries)
    const cacheKey = `${text}|${mode}|${limit}`;
    const cached = getCached(cacheKey);
    if (cached) {
      if (IS_DEV) console.debug('[TRANSLITERATOR] Cache hit for:', text);
      lastSuggestions = cached;
      return cached;
    }
    
    // OPTIMIZATION: Don't add timestamp to allow browser caching
    const requestUrl = buildRunnerUrl({ q: text, limit, mode });
    if (IS_DEV) {
      console.debug('[TRANSLITERATOR] CALLING RUNNER VIA PROXY', { requestUrl, text, mode, limit });
    }

    try {
      const res = await fetch(requestUrl, {
        method: 'GET',
        signal,
        // OPTIMIZATION: Allow browser caching instead of no-store
        cache: 'default',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (res.status === 304) {
        if (IS_DEV) console.debug('[TRANSLITERATOR] 304 Not Modified; using last suggestions');
        return lastSuggestions;
      }

      if (!res.ok) {
        console.error('[TRANSLITERATOR] Runner returned non-200', res.status);
        return [];
      }

      const parsed = await safeJson(res);
      if (!parsed || parsed.success === false) {
        if (IS_DEV) console.debug('[TRANSLITERATOR] No suggestions or success=false', parsed);
        return [];
      }
      const normalized = (parsed.suggestions || [])
        .map((s) => ({
          text: s.text || s.ta || s.word || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
        .filter((s) => s.text);
      if (IS_DEV) console.debug('[TRANSLITERATOR] Normalized suggestions:', normalized.length, normalized);
      lastSuggestions = normalized;
      // OPTIMIZATION: Cache the response for fast repeat lookups
      setCache(cacheKey, normalized);
      return normalized;
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw err;
      }
      console.error('[TRANSLITERATOR] Runner fetch failed', err);
      return [];
    }
  }

  // Attach globally for runtime callers.
  if (typeof window !== 'undefined') {
    window.transliterateViaRunner = transliterateViaRunner;
    // Signal readiness for any code awaiting a promise.
    if (!window.transliteratorReady) {
      window.transliteratorReady = Promise.resolve();
    }
  }
})();

