// Shared transliteration helper that always targets the runner (never the Go backend).
(() => {
  const IS_DEV = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;

  async function transliterateViaRunner(text, mode = 'spoken', limit = 8, signal) {
    if (typeof window === "undefined") return [];
    const v = window.NEXT_PUBLIC_TRANSLITERATOR_BASE_URL;
    if (!v || typeof v !== "string") {
      console.error("[TRANSLITERATOR] Missing NEXT_PUBLIC_TRANSLITERATOR_BASE_URL", { value: v });
      return [];
    }
    const baseUrl = v.replace(/\/+$/, "");

    const requestUrl = `${baseUrl}/api/v1/transliterate`;
    if (IS_DEV) {
      const isRelative = !/^https?:\/\//i.test(requestUrl);
      if (requestUrl.includes('prooftamil-backend') || isRelative || requestUrl.startsWith('/api/')) {
        throw new Error('[TRANSLITERATOR] Invalid runner URL (backend/proxy use is forbidden)');
      }
    }
    console.log('[TRANSLITERATOR] Using base URL:', baseUrl);

    if (!requestUrl) return [];

    const logBase = requestUrl.replace(/\/api\/v1\/transliterate$/, '');
    if (IS_DEV) {
      console.debug('[TRANSLITERATOR] CALLING RUNNER', { baseUrl: logBase, text, mode, limit });
    }

    try {
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': 'prooftamil-frontend',
        },
        body: JSON.stringify({ text, mode, limit }),
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

