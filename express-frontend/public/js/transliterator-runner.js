// Shared transliteration helper that targets the Go suggest engine (fast path).
(() => {
  const IS_DEV = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost';
  let lastSuggestions = [];

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
    const requestUrl = buildRunnerUrl({ q: text, limit, mode, _ts: Date.now() });
    if (IS_DEV) {
      console.debug('[TRANSLITERATOR] CALLING RUNNER VIA PROXY', { requestUrl, text, mode, limit });
    }

    try {
      const res = await fetch(requestUrl, {
        method: 'GET',
        signal,
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
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
        return [];
      }
      const normalized = (parsed.suggestions || [])
        .map((s) => ({
          text: s.ta || s.word || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
        .filter((s) => s.text);
      lastSuggestions = normalized;
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

