module.exports = async function handler(req, res) {
  // Call the Go backend as the single entrypoint (it will proxy to Node suggest service,
  // and fall back to Runner/local lexicon if needed).
  // Accept both formats:
  // - BACKEND_URL=https://.../api/v1
  // - BACKEND_URL=https://... (we append /api/v1)
  function getBackendApiUrl() {
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:8080';
    if (baseUrl.endsWith('/api/v1')) return baseUrl;
    return baseUrl.replace(/\/$/, '') + '/api/v1';
  }
  const base = getBackendApiUrl();

  // UI policy: Google-IME-like depth (ranked).
  const { q = '', limit = 10, mode = 'spoken' } = req.query || {};

  // -----------------------
  // Quality firewall helpers
  // -----------------------
  const TAMIL_BLOCK_RE = /[\u0B80-\u0BFF]/;
  const ONLY_TAMIL_RE = /^[\u0B80-\u0BFF\s]+$/;
  const DEP_VOWELS = new Set(['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ']);
  const INDEP_VOWELS = new Set(['அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ', 'எ', 'ஏ', 'ஐ', 'ஒ', 'ஓ', 'ஔ']);
  const PULLI = '்';

  function normalizeTamilWord(w) {
    const s = String(w || '')
      .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰²³]/g, '') // superscripts
      .replace(/\u200c|\u200d/g, '') // ZWJ/ZWNJ
      .replace(/\s+/g, '') // suggestions should be single tokens
      .trim();
    return s.normalize ? s.normalize('NFC') : s;
  }

  function isStructurallyValidTamil(w) {
    if (!w) return false;
    const s = normalizeTamilWord(w);
    if (!s) return false;
    if (!TAMIL_BLOCK_RE.test(s)) return false;
    if (!ONLY_TAMIL_RE.test(s)) return false;
    // Basic orthography guards (fast):
    // - cannot start with dependent vowel
    // - no dependent+dependent in a row
    // - no dependent+independent or independent+dependent adjacency
    // - no double pulli
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const prev = i > 0 ? s[i - 1] : '';
      if (i === 0 && DEP_VOWELS.has(ch)) return false;
      if (prev) {
        if (DEP_VOWELS.has(prev) && DEP_VOWELS.has(ch)) return false;
        if (DEP_VOWELS.has(prev) && INDEP_VOWELS.has(ch)) {
          // Allow a small loanword-friendly exception:
          // Aksharamukha can emit sequences like "...ரி" + "எ" + "ந..." for English words
          // (e.g., friend -> "ஃப்ரிஎந்த்"). If the independent vowel is followed by a consonant,
          // treat it as a new syllable boundary instead of rejecting the entire candidate.
          const next = i + 1 < s.length ? s[i + 1] : '';
          if (!next) return false; // end-of-word like "முஉ" is still garbage
          if (DEP_VOWELS.has(next) || INDEP_VOWELS.has(next)) return false;
        }
        if (INDEP_VOWELS.has(prev) && DEP_VOWELS.has(ch)) return false;
        if (prev === PULLI && ch === PULLI) return false;
      }
    }
    return true;
  }

  function normalizeSuggestions(raw, lim) {
    const seen = new Set();
    const out = [];
    const cap = Math.max(1, Math.min(Number(lim) || 10, 10));
    for (const s of Array.isArray(raw) ? raw : []) {
      const wordRaw = (typeof s === 'string')
        ? s
        : (s && (s.word || s.ta || s.text || s.suggestion));
      const word = normalizeTamilWord(wordRaw);
      if (!word) continue;
      const key = word;
      if (seen.has(key)) continue;
      seen.add(key);
      const scoreRaw = (typeof s === 'object' && s) ? s.score : undefined;
      const score = Number.isFinite(scoreRaw) ? Number(scoreRaw) : Number(scoreRaw || 0);
      out.push({ word, score });
      if (out.length >= cap) break;
    }
    return out;
  }

  function rerank(qNorm, suggestions) {
    // Re-score to be stable and comparable (0..1), preventing "junk score=1" from upstream.
    const qLen = (qNorm || '').length;
    const minLen = qLen >= 7 ? 4 : (qLen >= 5 ? 3 : 1);
    const maxLen = qLen <= 2 ? 3 : 12;

    const rescored = [];
    for (let i = 0; i < (suggestions || []).length; i++) {
      const s = suggestions[i];
      const w = s.word;
      if (!isStructurallyValidTamil(w)) continue;
      if (w.length < minLen) continue;
      if (w.length > maxLen) continue;

      // base score: use upstream if present, else rank-based
      const upstream = Number.isFinite(s.score) ? s.score : 0;
      const rankBase = 1.0 - i * 0.07; // smooth drop
      const base = Math.max(0, Math.min(1, Math.max(upstream, rankBase)));

      // penalize too-short fragments for longer inputs
      const lenDelta = Math.abs(w.length - qLen);
      let final = base - 0.06 * Math.max(0, (qLen >= 5 ? (qLen - w.length) : 0)) - 0.02 * lenDelta;

      // small boost for frequency-looking forms: ending with common suffix characters
      if (/[து|ம்|ன்|ய்]$/.test(w)) final += 0.03;

      final = Math.max(0, Math.min(1, final));
      rescored.push({ word: w, score: +final.toFixed(2) });
    }

    rescored.sort((a, b) => (b.score - a.score) || (a.word.length - b.word.length) || a.word.localeCompare(b.word));

    // Fallback: for some English loanwords, strict Tamil orthography rules can reject all
    // candidates (even though they are Tamil-script and users expect *something* like Google IME).
    // If strict filtering yields nothing, accept Tamil-block tokens that have no Latin/digits,
    // then score them by rank/length.
    if (!rescored.length && qLen >= 4) {
      const loose = [];
      for (let i = 0; i < (suggestions || []).length; i++) {
        const s = suggestions[i];
        const w = String(s?.word || '').trim();
        if (!w) continue;
        if (!TAMIL_BLOCK_RE.test(w)) continue;
        if (/[A-Za-z0-9]/.test(w)) continue;
        if (w.length < 2 || w.length > maxLen) continue;
        const upstream = Number.isFinite(s.score) ? s.score : 0;
        const rankBase = 1.0 - i * 0.08;
        let final = Math.max(upstream, rankBase);
        final -= 0.02 * Math.abs(w.length - qLen);
        final = Math.max(0, Math.min(1, final));
        loose.push({ word: w, score: +final.toFixed(2) });
      }
      loose.sort((a, b) => (b.score - a.score) || (a.word.length - b.word.length) || a.word.localeCompare(b.word));
      rescored.push(...loose);
    }

    // normalize scores so top is 1.0 (competitor-style), keep relative spacing
    const top = rescored[0]?.score || 0;
    const out = rescored.map((s, idx) => {
      const scaled = top > 0 ? (s.score / top) : s.score;
      const score = Math.max(0.3, Math.min(1, +(scaled.toFixed(2))));
      return { word: s.word, score: idx === 0 ? 1 : score };
    });
    return out.slice(0, Math.max(1, Math.min(Number(limit) || 10, 10)));
  }

  function respondOk(source, suggestions, meta = {}) {
    return res.status(200).json({
      success: true,
      query: q,
      mode,
      suggestions: suggestions || [],
      meta: { source, ...meta },
    });
  }

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

  // Strict overrides: for some extremely common tokens, upstream transliteration quality
  // can include junk / half-words. For these, return only the expected word(s).
  // This keeps the IME UX clean and avoids confusing "invalid" Tamil outputs.
  const STRICT_OVERRIDES = {
    // Very common function words
    enna: ['என்ன'],
    namma: ['நம்ம'],
    // எனது (my)
    enathu: ['எனது'],
    enadu: ['எனது'],
    enadhu: ['எனது'],
    // South
    therkku: ['தெற்கு'],
    therku: ['தெற்கு'],
    therkk: ['தெற்கு'],

    // "enpathu" family (ranking like competitor: top-5 with descending scores)
    // Useful for "என்பது" vs "எண்பது" vs "எண்பத்து" etc.
    enpathu: ['என்பது', 'எண்பது', 'எண்பத்து', 'என்பத்து', 'எண்பது\u200c'],

    // Common identity words
    // "tamilan" is often intended as "தமிழன்" (Tamil person/man), but users may also want the base "தமிழ்".
    // Provide stable top-3 to match Google-IME-style UX.
    tamilan: ['தமிழன்', 'தமிழர்', 'தமிழ்'],
    tamilar: ['தமிழர்', 'தமிழன்', 'தமிழ்'],

    // Google-IME-like variants for very common nouns
    nanban: ['நண்பன்', 'நண்பா', 'நண்பனை', 'நண்பனே', 'நண்பர்', 'நண்பர்கள்', 'நண்பனுக்கு', 'நண்பனுடன்', 'நண்பனிடம்', 'நண்பனுடைய'],

    // மொழி / mozhi: avoid invalid "மொலி"
    moli: ['மொழி', 'மொழியை', 'மொழியில்', 'மொழியால்', 'மொழிகள்', 'மொழியுடன்'],
    mozhi: ['மொழி', 'மொழியை', 'மொழியில்', 'மொழியால்', 'மொழிகள்', 'மொழியுடன்'],
  };
  const target = `${base.replace(/\/+$/, '')}/transliterate/suggest?q=${encodeURIComponent(
    q
  )}&limit=${encodeURIComponent(limit)}&mode=${encodeURIComponent(mode)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const headers = { Accept: 'application/json' };
  // Never log secrets. (Cloud logs are long-lived and widely accessible.)
  console.log('[Translit Proxy] target:', target);
  console.log('[Translit Proxy] outbound headers:', {
    Accept: headers.Accept,
    'X-Client-Id': headers['X-Client-Id'],
    'X-API-Key': headers['X-API-Key'] ? '[REDACTED]' : undefined,
  });

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
    // Never hard-fail suggest API. If Runner is down/misconfigured, return empty suggestions.
    if (status >= 400) {
      console.error('[Translit Proxy] Runner error', { status, body: raw.slice(0, 500) });
      // Strict overrides should still work even if runner fails.
      const nq = normalizeQuery(q);
      const strict = STRICT_OVERRIDES[nq];
      if (strict && strict.length) {
        const only = strict
          .filter(Boolean)
          .map((w, idx) => ({ word: normalizeTamilWord(w), score: Math.max(0.55, +(1.0 - idx * 0.1).toFixed(2)) }));
        return respondOk('override', only, { runner_status: status });
      }
      return respondOk('runner_error', [], { runner_status: status });
    }

    // 1) Strict overrides: return only canonical suggestions with clean schema.
    const nq = normalizeQuery(q);
    const strict = STRICT_OVERRIDES[nq];
    if (strict && strict.length) {
      const out = strict
        .filter(Boolean)
        .map((w, idx) => ({ word: normalizeTamilWord(w), score: Math.max(0.55, +(1.0 - idx * 0.1).toFixed(2)) }));
      return respondOk('override', out, { runner_status: status });
    }

    // 2) Start with runner suggestions and normalize them into [{word, score}]
    const runnerArr =
      (data && typeof data === 'object' && (Array.isArray(data.suggestions) ? data.suggestions : null)) ||
      (Array.isArray(data) ? data : []);
    let suggestions = normalizeSuggestions(runnerArr, limit);

    // 3) Canonical "must include" words: ensure they appear (but do not hide other results)
    const forced = CANONICAL_OVERRIDES[nq];
    if (forced && forced.length) {
      for (const w of forced) {
        const ww = normalizeTamilWord(w);
        if (!ww) continue;
        if (!suggestions.some((s) => s.word === ww)) suggestions.unshift({ word: ww, score: 0.99 });
      }
    }

    // 4) Quality firewall: validate + rerank + cap
    suggestions = rerank(nq, suggestions);

    return respondOk('runner', suggestions, { runner_status: status, raw_count: (runnerArr || []).length });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[Translit Proxy] Runner request timed out');
      return respondOk('timeout', [], { runner_status: 504 });
    }
    console.error('[Translit Proxy] Runner request failed', err);
    return respondOk('runner_error', [], { runner_status: 502 });
  } finally {
    clearTimeout(timeout);
  }
};

