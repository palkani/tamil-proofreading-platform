// Shared transliteration helper that always targets the runner (never the Go backend).
(() => {
  const IS_DEV = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;

  function readBaseUrl() {
    const envBase =
      (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TRANSLITERATOR_BASE_URL) ||
      (typeof window !== 'undefined' && window.NEXT_PUBLIC_TRANSLITERATOR_BASE_URL) ||
      '';
    const trimmed = envBase.trim().replace(/\/+$/, '');
    if (!trimmed) {
      console.error('[TRANSLITERATOR] Missing NEXT_PUBLIC_TRANSLITERATOR_BASE_URL');
      return '';
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      console.error('[TRANSLITERATOR] Runner base URL must be absolute');
      return '';
    }
    return trimmed;
  }

  function buildRunnerUrl() {
    const baseUrl = readBaseUrl();
    if (!baseUrl) return '';
    const url = `${baseUrl}/api/v1/transliterate`;
    if (IS_DEV) {
      const isRelative = !/^https?:\/\//i.test(url);
      if (url.includes('prooftamil-backend') || isRelative || url.startsWith('/api/')) {
        throw new Error('[TRANSLITERATOR] Invalid runner URL (backend/proxy use is forbidden)');
      }
    }
    return url;
  }

  async function transliterateViaRunner(text, mode = 'spoken', limit = 8, signal) {
    const requestUrl = buildRunnerUrl();
    if (!requestUrl) return [];

    const baseUrl = requestUrl.replace(/\/api\/v1\/transliterate$/, '');
    if (IS_DEV) {
      console.debug('[TRANSLITERATOR] CALLING RUNNER', { baseUrl, text, mode, limit });
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

  // Expose globally so all front-end scripts share the exact same runner-only implementation.
  window.transliterateViaRunner = transliterateViaRunner;
})();

