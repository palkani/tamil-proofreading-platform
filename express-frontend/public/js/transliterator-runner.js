// Shared transliteration helper that always targets the runner (never the Go backend).
(() => {
  const IS_DEV = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;

  async function transliterateViaRunner(text, mode = 'spoken', limit = 8, signal) {
    const requestUrl = `/api/transliterate/suggest?q=${encodeURIComponent(text)}&limit=${encodeURIComponent(limit)}&mode=${encodeURIComponent(mode)}`;
    if (IS_DEV) {
      console.debug('[TRANSLITERATOR] CALLING RUNNER VIA PROXY', { requestUrl, text, mode, limit });
    }

    try {
      const res = await fetch(requestUrl, {
        method: 'GET',
        signal,
      });

      if (!res.ok) {
        console.error('[TRANSLITERATOR] Runner returned non-200', res.status);
        return [];
      }

      const data = await res.json().catch(() => ({}));
      return data?.suggestions || [];
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

