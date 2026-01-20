// Font Converter (legacy encodings <-> Unicode)
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    from: $('fc-from'),
    to: $('fc-to'),
    swap: $('fc-swap'),
    detected: $('fc-detected'),
    input: $('fc-input'),
    output: $('fc-output'),
    status: $('fc-status'),
    clear: $('fc-clear'),
    copy: $('fc-copy'),
    download: $('fc-download'),
    preview: $('fc-preview'),
    previewHint: $('fc-preview-hint'),
  };

  const state = {
    mapsPromise: null,
  };

  function hasTamilUnicode(text) {
    return /[\u0B80-\u0BFF]/.test(String(text || ''));
  }

  function hasHighByte(text) {
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 128 && c <= 255) return true;
    }
    return false;
  }

  function detectEncoding(text) {
    const s = String(text || '');
    if (!s.trim()) return 'unicode';
    if (hasTamilUnicode(s)) return 'unicode';
    if (hasHighByte(s)) return 'tscii';
    return 'bamini';
  }

  function setStatus(msg, kind) {
    if (!els.status) return;
    els.status.textContent = msg || '';
    els.status.classList.remove('text-red-600', 'text-gray-600', 'text-green-700');
    if (kind === 'error') els.status.classList.add('text-red-600');
    else if (kind === 'success') els.status.classList.add('text-green-700');
    else els.status.classList.add('text-gray-600');
  }

  async function loadMaps() {
    if (state.mapsPromise) return state.mapsPromise;
    state.mapsPromise = (async () => {
      const [baminiRes, tsciiRes] = await Promise.all([
        fetch('/font-maps/bamini_pairs.json', { cache: 'force-cache' }),
        fetch('/font-maps/tscii_v17.json', { cache: 'force-cache' }),
      ]);

      const baminiJson = await baminiRes.json();
      const tsciiJson = await tsciiRes.json();

      const baminiPairs = Array.isArray(baminiJson?.pairs) ? baminiJson.pairs : [];
      const tscii = Array.isArray(tsciiJson?.tscii) ? tsciiJson.tscii : [];

      if (baminiPairs.length < 100) {
        throw new Error('Bamini mapping failed to load');
      }
      if (tscii.length !== 256) {
        throw new Error('TSCII mapping failed to load');
      }

      return {
        baminiPairs,
        tscii,
        tsciiVersion: tsciiJson?.version || '1.7',
      };
    })();
    return state.mapsPromise;
  }

  function applyPairs(text, pairs) {
    let out = String(text || '');
    for (const [from, to] of pairs) {
      if (!from) continue;
      out = out.split(from).join(to ?? '');
    }
    return out;
  }

  function invertPairs(pairs) {
    return pairs.map(([u, b]) => [b, u]);
  }

  // Bamini <-> Unicode
  function unicodeToBamini(text, maps) {
    return applyPairs(text, maps.baminiPairs);
  }
  function baminiToUnicode(text, maps) {
    // Apply inverse in the SAME order as unicode->bamini rules (longer sequences first)
    return applyPairs(text, invertPairs(maps.baminiPairs));
  }

  // TSCII <-> Unicode (v1.7)
  // Notes:
  // - TSCII uses pre-modifiers (E/EE/AI) that appear BEFORE consonants.
  // - Unicode stores vowel signs AFTER consonants.
  // - Compound vowel signs (ொ/ோ/ௌ) are represented in TSCII as:
  //   E/EE + consonant + AA  OR  E + consonant + AU_MARK
  //   We output the decomposed Unicode sequence which renders correctly:
  //   consonant + 'ெ' + 'ா' (renders as 'ொ'), etc.
  const TSCII_PRE = new Set([0xA6, 0xA7, 0xA8]);
  const TSCII_POST = new Set([0xA1, 0xAA]);
  const preUnicode = (code) => (code === 0xA6 ? '\u0BC6' : code === 0xA7 ? '\u0BC7' : '\u0BC8'); // ெ ே ை
  const postUnicode = (code) => (code === 0xA1 ? '\u0BBE' : '\u0BD7'); // ா, ௗ

  // Basic consonant bytes (plus grantha + ksha) that can accept pre/post modifiers in TSCII.
  function isTsciiConsonantByte(code) {
    // Base consonants range
    if (code >= 0xB8 && code <= 0xC9) return true;
    // Grantha letters
    if (code >= 0x83 && code <= 0x86) return true;
    // Ksha ligature
    if (code === 0x87) return true;
    return false;
  }

  function tsciiToUnicode(text, maps) {
    const s = String(text || '');
    let out = '';
    for (let i = 0; i < s.length; ) {
      const code = s.charCodeAt(i);
      if (code < 128) {
        out += s[i];
        i += 1;
        continue;
      }

      // Pre-modifier handling: [pre][consonant][optional post]
      if (TSCII_PRE.has(code) && i + 1 < s.length) {
        const nextCode = s.charCodeAt(i + 1);
        if (nextCode >= 0 && nextCode <= 255 && isTsciiConsonantByte(nextCode)) {
          const base = maps.tscii[nextCode] || '';
          const pre = preUnicode(code);
          if (i + 2 < s.length) {
            const postCode = s.charCodeAt(i + 2);
            if (TSCII_POST.has(postCode)) {
              out += base + pre + postUnicode(postCode);
              i += 3;
              continue;
            }
          }
          out += base + pre;
          i += 2;
          continue;
        }
      }

      // Post modifiers that appear unexpectedly: emit the vowel mark anyway.
      if (TSCII_POST.has(code)) {
        out += postUnicode(code);
        i += 1;
        continue;
      }

      // Direct table mapping (includes uyirmei/mei/ligatures)
      if (code >= 0 && code <= 255) {
        out += maps.tscii[code] || '';
      } else {
        out += s[i];
      }
      i += 1;
    }
    return out;
  }

  // Unicode -> TSCII:
  // We emit bytes as characters with codes 0-255. This output looks correct only
  // when rendered with a compatible TSCII font.
  function buildUnicodeToTsciiMap(maps) {
    const uniToCode = new Map();
    for (let code = 0; code < 256; code++) {
      const u = maps.tscii[code];
      if (!u) continue;
      // Prefer first seen (stable). Some mappings may collide; we handle common ones explicitly below.
      if (!uniToCode.has(u)) uniToCode.set(u, code);
    }
    return uniToCode;
  }

  function unicodeToTscii(text, maps) {
    const s = String(text || '');
    const uniToCode = buildUnicodeToTsciiMap(maps);

    const out = [];

    // Helper to emit a single byte code as a 1-char string.
    const emit = (code) => out.push(String.fromCharCode(code));

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      // ASCII passthrough
      if (ch.charCodeAt(0) < 128) {
        out.push(ch);
        continue;
      }

      // Handle consonant + virama (mei)
      if (i + 1 < s.length && s[i + 1] === '\u0BCD') {
        const base = ch;
        const mei = base + '\u0BCD';
        const code = uniToCode.get(mei);
        if (code != null) {
          emit(code);
          i += 1;
          continue;
        }
      }

      // Handle consonant + vowel sign
      if (i + 1 < s.length) {
        const next = s[i + 1];
        const baseCode = uniToCode.get(ch);

        // Only attempt vowel sign composition if base is known consonant/grantha.
        if (baseCode != null) {
          // Pre-vowels in TSCII must be emitted before consonant
          if (next === '\u0BC6') {
            emit(0xA6); emit(baseCode); i += 1; continue;
          }
          if (next === '\u0BC7') {
            emit(0xA7); emit(baseCode); i += 1; continue;
          }
          if (next === '\u0BC8') {
            emit(0xA8); emit(baseCode); i += 1; continue;
          }

          // Compound vowels as decomposed sequences:
          // consonant + 'ெ' + 'ா'  => [A6][base][A1]
          // consonant + 'ே' + 'ா'  => [A7][base][A1]
          // consonant + 'ெ' + 'ௗ'  => [A6][base][AA]
          if (next === '\u0BC6' && i + 2 < s.length && s[i + 2] === '\u0BBE') {
            emit(0xA6); emit(baseCode); emit(0xA1); i += 2; continue;
          }
          if (next === '\u0BC7' && i + 2 < s.length && s[i + 2] === '\u0BBE') {
            emit(0xA7); emit(baseCode); emit(0xA1); i += 2; continue;
          }
          if (next === '\u0BC6' && i + 2 < s.length && s[i + 2] === '\u0BD7') {
            emit(0xA6); emit(baseCode); emit(0xAA); i += 2; continue;
          }

          // Post vowels (AA/I/II/U/UU)
          if (next === '\u0BBE') { emit(baseCode); emit(0xA1); i += 1; continue; }
          if (next === '\u0BBF') { emit(baseCode); emit(0xA2); i += 1; continue; }
          if (next === '\u0BC0') { emit(baseCode); emit(0xA3); i += 1; continue; }
          if (next === '\u0BC1') { emit(baseCode); emit(0xA4); i += 1; continue; }
          if (next === '\u0BC2') { emit(baseCode); emit(0xA5); i += 1; continue; }
        }
      }

      // Direct mapping (independent vowels, consonants, numerals, grantha ligatures, etc.)
      const direct = uniToCode.get(ch);
      if (direct != null) {
        emit(direct);
        continue;
      }

      // Fallback: keep the character as-is (prevents data loss)
      out.push(ch);
    }

    return out.join('');
  }

  async function convertNow() {
    if (!els.input || !els.output || !els.from || !els.to) return;
    const raw = els.input.value || '';
    const maps = await loadMaps();

    const selectedFrom = els.from.value;
    const selectedTo = els.to.value;

    const inferred = detectEncoding(raw);
    const fromEnc = selectedFrom === 'auto' ? inferred : selectedFrom;
    const toEnc = selectedTo;

    if (els.detected) {
      els.detected.textContent = selectedFrom === 'auto'
        ? `Detected: ${inferred.toUpperCase()}`
        : '';
    }

    try {
      let out = raw;

      if (fromEnc === toEnc) {
        // no-op
      } else if (fromEnc === 'unicode' && toEnc === 'bamini') {
        out = unicodeToBamini(raw, maps);
      } else if (fromEnc === 'bamini' && toEnc === 'unicode') {
        out = baminiToUnicode(raw, maps);
      } else if (fromEnc === 'tscii' && toEnc === 'unicode') {
        out = tsciiToUnicode(raw, maps);
      } else if (fromEnc === 'unicode' && toEnc === 'tscii') {
        out = unicodeToTscii(raw, maps);
      } else if (fromEnc === 'bamini' && toEnc === 'tscii') {
        out = unicodeToTscii(baminiToUnicode(raw, maps), maps);
      } else if (fromEnc === 'tscii' && toEnc === 'bamini') {
        out = unicodeToBamini(tsciiToUnicode(raw, maps), maps);
      } else if (fromEnc === 'tscii' && toEnc === 'bamini') {
        out = unicodeToBamini(tsciiToUnicode(raw, maps), maps);
      } else if (fromEnc === 'bamini' && toEnc === 'unicode') {
        out = baminiToUnicode(raw, maps);
      } else {
        // Fallback through Unicode if possible
        let unicode = raw;
        if (fromEnc === 'bamini') unicode = baminiToUnicode(raw, maps);
        else if (fromEnc === 'tscii') unicode = tsciiToUnicode(raw, maps);

        if (toEnc === 'unicode') out = unicode;
        else if (toEnc === 'bamini') out = unicodeToBamini(unicode, maps);
        else if (toEnc === 'tscii') out = unicodeToTscii(unicode, maps);
      }

      els.output.value = out;

      // Preview behavior:
      // - Unicode: show normally with Tamil font stack.
      // - Legacy (Bamini/TSCII): attempt to render using the legacy font name (if installed)
      if (els.preview) {
        els.preview.textContent = out;
      }
      if (els.previewHint) {
        els.previewHint.textContent = '';
      }

      if (els.preview) {
        if (toEnc === 'bamini') {
          els.preview.style.fontFamily = 'Bamini, monospace';
          if (els.previewHint) {
            els.previewHint.textContent =
              'Bamini output is legacy-encoded text. It will look correct only if the Bamini font is installed on your device (or in Word/Photoshop with Bamini selected).';
          }
        } else if (toEnc === 'tscii') {
          els.preview.style.fontFamily = 'TSCII, monospace';
          if (els.previewHint) {
            els.previewHint.textContent =
              'TSCII output is legacy-encoded text. It will look correct only if a compatible TSCII font is installed.';
          }
        } else {
          els.preview.style.fontFamily = '';
          if (els.previewHint) {
            els.previewHint.textContent = 'Unicode preview (works everywhere).';
          }
        }
      }

      setStatus(`Converted ${fromEnc.toUpperCase()} → ${toEnc.toUpperCase()}`, 'success');
    } catch (e) {
      console.error(e);
      setStatus(e.message || 'Conversion failed', 'error');
    }
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  async function copyOutput() {
    const text = els.output?.value || '';
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied to clipboard.', 'success');
    } catch (_e) {
      // fallback
      els.output.focus();
      els.output.select();
      document.execCommand('copy');
      setStatus('Copied to clipboard.', 'success');
    }
  }

  function downloadOutput() {
    const text = els.output?.value || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prooftamil-font-converter-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function swapEncodings() {
    if (!els.from || !els.to) return;
    const fromVal = els.from.value;
    const toVal = els.to.value;

    // Avoid swapping "auto" into target
    els.from.value = toVal === 'auto' ? 'unicode' : toVal;
    els.to.value = fromVal === 'auto' ? 'unicode' : fromVal;
  }

  function init() {
    if (!els.input || !els.output) return;

    const debounced = debounce(() => convertNow(), 250);

    els.input.addEventListener('input', debounced);
    els.from.addEventListener('change', () => convertNow());
    els.to.addEventListener('change', () => convertNow());

    if (els.swap) {
      els.swap.addEventListener('click', () => {
        swapEncodings();
        convertNow();
      });
    }
    if (els.clear) {
      els.clear.addEventListener('click', () => {
        els.input.value = '';
        els.output.value = '';
        if (els.detected) els.detected.textContent = '';
        setStatus('', 'info');
      });
    }
    if (els.copy) els.copy.addEventListener('click', copyOutput);
    if (els.download) els.download.addEventListener('click', downloadOutput);

    // Warm maps early for smoother UX
    loadMaps().then(() => setStatus('Ready.', 'info')).catch((e) => setStatus(e.message || 'Failed to load maps', 'error'));
  }

  document.addEventListener('DOMContentLoaded', init);
})();


