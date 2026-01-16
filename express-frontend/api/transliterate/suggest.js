module.exports = async function handler(req, res) {
  // Prefer env override; fallback to known good runner base.
  const base =
    process.env.TRANSLITERATOR_BASE_URL ||
    process.env.RUNNER_BASE_URL ||
    'https://prooftamil-runner-991187041222.asia-south1.run.app';

  const { q = '', limit = 8, mode = 'spoken' } = req.query || {};

  // Canonical overrides for critical common inputs when upstream runner quality varies.
  // These behave like Google Input Tools: guarantee top suggestion for certain tokens.
  function normalizeQuery(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z']/g, '');
  }

  const CANONICAL_OVERRIDES = {
    murugan: ['முருகன்'],
    // Keep tamil here as a safety net even if runner is misconfigured.
    tamil: ['தமிழ்'],
    vanakkam: ['வணக்கம்'],
  };
  const target = `${base.replace(/\/+$/, '')}/api/v1/transliterate/suggest?q=${encodeURIComponent(
    q
  )}&limit=${encodeURIComponent(limit)}&mode=${encodeURIComponent(mode)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const headers = {
    Accept: 'application/json',
  };
  const clientId = process.env.RUNNER_CLIENT_ID || 'prooftamil-frontend';
  const apiKey = process.env.RUNNER_API_KEY;
  headers['X-Client-Id'] = clientId;
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
    console.log('[Translit Proxy] Using X-API-Key header for client', clientId);
  } else {
    console.warn('[Translit Proxy] RUNNER_API_KEY not set; proceeding without X-API-Key');
  }
  console.log('[Translit Proxy] target:', target);
  console.log('[Translit Proxy] outbound headers:', headers);

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

    // Post-process suggestions to enforce canonical outputs for some inputs.
    try {
      const nq = normalizeQuery(q);
      const forced = CANONICAL_OVERRIDES[nq];
      if (forced && data && typeof data === 'object') {
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        const next = Array.isArray(suggestions) ? [...suggestions] : [];

        for (const w of forced) {
          if (!w) continue;
          const idx = next.findIndex((s) => (s && (s.word || s.ta)) === w);
          if (idx >= 0) {
            const item = next[idx];
            // bump score + move to front
            const bumped = {
              ...item,
              word: item.word || w,
              score: Math.max(Number(item.score || 0) || 0, 0.99),
            };
            next.splice(idx, 1);
            next.unshift(bumped);
          } else {
            next.unshift({ word: w, score: 0.99 });
          }
        }

        data.suggestions = next;
        // Ensure a truthy "success" for downstream clients.
        if (data.success === undefined) data.success = true;
      }
    } catch (e) {
      // non-fatal: never break proxy on enrichment
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

