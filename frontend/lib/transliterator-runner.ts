export function readBaseUrl() {
  const base =
    process.env.NEXT_PUBLIC_TRANSLITERATOR_BASE_URL;

  if (!base) {
    console.error(
      '[TRANSLITERATOR] NEXT_PUBLIC_TRANSLITERATOR_BASE_URL missing at build time'
    );
    return '';
  }

  return base.replace(/\/+$/, '');
}

export async function transliterateViaRunner(text: string, mode: 'spoken' | 'written' = 'spoken', limit = 8, signal?: AbortSignal) {
  const baseUrl = readBaseUrl();
  if (!baseUrl) return [];

  const requestUrl = `${baseUrl}/api/v1/transliterate`;

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
    return (data as any)?.suggestions || [];
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    console.error('[TRANSLITERATOR] Runner fetch failed', err);
    return [];
  }
}

