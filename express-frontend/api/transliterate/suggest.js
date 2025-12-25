module.exports = async function handler(req, res) {
  // Hardcoded runner base to avoid env misconfiguration at runtime
  const base = 'https://prooftamil-runner-991187041222.asia-south1.run.app';

  const { q = '', limit = 8, mode = 'spoken' } = req.query || {};
  const target = `${base.replace(/\/+$/, '')}/api/v1/transliterate/suggest?q=${encodeURIComponent(
    q
  )}&limit=${encodeURIComponent(limit)}&mode=${encodeURIComponent(mode)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const headers = {
    'X-Client-Id': 'prooftamil-frontend',
    Accept: 'application/json',
  };
  const apiKey = process.env.RUNNER_API_KEY;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    console.log('[Translit Proxy] Using Authorization bearer header');
  } else {
    console.warn('[Translit Proxy] RUNNER_API_KEY not set; proceeding without Authorization header');
  }
  console.log('[Translit Proxy] target:', target);

  try {
    const resp = await fetch(target, {
      signal: controller.signal,
      headers,
    });
    const status = resp.status;
    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_err) {
      data = raw;
    }
    if (status >= 400) {
      console.error('[Translit Proxy] Runner error', { status, body: raw.slice(0, 500) });
    }
    res.status(status).send(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[Translit Proxy] Runner request timed out');
      return res.status(504).json({ error: 'Runner request timed out' });
    }
    console.error('[Translit Proxy] Runner request failed', err);
    res.status(502).json({ error: 'Runner request failed' });
  } finally {
    clearTimeout(timeout);
  }
};

