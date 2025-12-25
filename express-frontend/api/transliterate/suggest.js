const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  const base = process.env.TRANSLITERATOR_BASE_URL;
  if (!base || !base.trim()) {
    console.error('[Translit Proxy] Missing TRANSLITERATOR_BASE_URL');
    return res.status(500).json({ error: 'TRANSLITERATOR_BASE_URL is not configured' });
  }

  const { q = '', limit = 8, mode = 'spoken' } = req.query || {};
  const target = `${base.replace(/\/+$/, '')}/api/v1/transliterate/suggest?q=${encodeURIComponent(
    q
  )}&limit=${encodeURIComponent(limit)}&mode=${encodeURIComponent(mode)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(target, { signal: controller.signal });
    const status = resp.status;
    let data = {};
    try {
      data = await resp.json();
    } catch (err) {
      console.error('[Translit Proxy] Failed to parse runner response', err);
    }
    res.status(status).json(data);
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

