/**
 * Voice Typing — Tamil Proofreading Platform
 * Uses Web Speech API to transcribe spoken words into the active editor.
 *
 * Fixed:
 *  - Correct TipTap editor access (window.tiptapWorkspaceEditor is a getter fn)
 *  - Save/restore cursor position for contenteditable (focus leaves editor on mic click)
 *  - Fresh SpeechRecognition instance on every auto-restart
 *  - Filled mic icon when recording, outline when idle
 */
(function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ── Unsupported browser ───────────────────────────────────────────────────
  if (!SR) {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.voice-typing-btn, .voice-mic-btn').forEach(btn => {
        btn.title = 'Voice typing requires Chrome or Edge browser.';
        btn.style.opacity = '0.45';
        btn.style.cursor = 'not-allowed';
        btn.onclick = e => {
          e.preventDefault();
          alert('Voice typing requires Google Chrome or Microsoft Edge.\nPlease open this page in Chrome to use voice typing.');
        };
      });
    });
    return;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let isListening = false;
  let currentLang = 'ta-IN';
  let _rec = null;          // current SpeechRecognition instance
  let _banner = null;       // interim text banner element
  let _savedRange = null;   // saved cursor range for contenteditable
  let _interimBuffer = '';  // last interim transcript (inserted on onspeechend if no final)
  let _interimFlushTimer = null; // timer to flush interim buffer after silence (ta-IN onspeechend unreliable)

  // ── Editor helpers ────────────────────────────────────────────────────────
  function getTipTap() {
    // workspace.js exposes tiptapWorkspaceEditor as a getter function
    if (!window.USE_TIPTAP_EDITOR) return null;
    const getter = window.tiptapWorkspaceEditor;
    if (typeof getter === 'function') return getter();   // call the getter
    if (getter && typeof getter.commands === 'object') return getter; // direct ref
    return null;
  }

  function getContentEditable() {
    const legacyEl = document.getElementById('editor');
    if (legacyEl && !legacyEl.classList.contains('hidden')) return legacyEl;
    const homeEl = document.getElementById('home-editor');
    if (homeEl) return homeEl;
    return null;
  }

  // ── Selection save/restore for contenteditable ────────────────────────────
  function saveRange() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      _savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreRange(el) {
    el.focus();
    if (_savedRange) {
      try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_savedRange);
        return true;
      } catch (_) { /* ignore */ }
    }
    // No saved range — place cursor at end
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return false;
  }

  // Attach selection-saving listeners once DOM is ready
  function attachSelectionListeners() {
    ['#editor', '#home-editor'].forEach(selector => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.addEventListener('keyup',    saveRange);
      el.addEventListener('mouseup',  saveRange);
      el.addEventListener('touchend', saveRange);
      el.addEventListener('blur',     saveRange); // most important: save on blur
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachSelectionListeners);
  } else {
    attachSelectionListeners();
  }

  // ── Insert text at cursor ─────────────────────────────────────────────────
  function insertText(text) {
    const tiptap = getTipTap();
    if (tiptap) {
      // TipTap manages focus/selection internally
      tiptap.chain().focus().insertContent(text).run();
      return;
    }

    const el = getContentEditable();
    if (!el) {
      console.warn('[VoiceTyping] No editor found to insert into');
      return;
    }

    // Restore saved cursor position before inserting
    restoreRange(el);

    // Try execCommand (works in Chrome contenteditable, undo-safe)
    const ok = document.execCommand('insertText', false, text);
    if (!ok) {
      // DOM fallback
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    // Save updated range after insertion
    saveRange();

    // Fire input event so word-count / draft-save listeners update
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ── Interim banner ────────────────────────────────────────────────────────
  function showInterim(text) {
    if (!_banner) {
      _banner = document.createElement('div');
      _banner.id = 'voice-interim-banner';
      _banner.setAttribute('aria-live', 'polite');
      document.body.appendChild(_banner);
    }
    _banner.textContent = text || '';
    _banner.classList.toggle('voice-interim-visible', Boolean(text));
  }

  function hideInterim() {
    if (_banner) _banner.classList.remove('voice-interim-visible');
  }

  // ── Button / icon state ───────────────────────────────────────────────────
  function setActive(active) {
    // Toggle class on all voice buttons
    document.querySelectorAll('.voice-typing-btn, .voice-mic-btn').forEach(btn => {
      btn.classList.toggle('voice-typing-active', active);
      btn.setAttribute('aria-pressed', String(active));
      btn.setAttribute('title', active ? 'Stop recording (click to stop)' : 'Voice typing — speak in Tamil');
    });

    // Swap icon: outline ↔ filled
    const iconOff = document.getElementById('voice-icon-off');
    const iconOn  = document.getElementById('voice-icon-on');
    if (iconOff) iconOff.classList.toggle('hidden', active);
    if (iconOn)  iconOn.classList.toggle('hidden', !active);
  }

  // ── Language pill toggle ──────────────────────────────────────────────────
  function updateLangUI(lang) {
    const toggle = document.getElementById('voice-lang-toggle');
    if (toggle) {
      const isTamil = lang === 'ta-IN';
      toggle.setAttribute('aria-checked', isTamil ? 'true' : 'false');
      toggle.title = isTamil ? 'Tamil voice input (click for English)' : 'English voice input (click for Tamil)';
    }
    // Legacy pill buttons
    document.querySelectorAll('.voice-lang-btn').forEach(btn => {
      btn.classList.toggle('voice-lang-active', btn.getAttribute('data-lang') === lang);
    });
  }

  // ── SpeechRecognition ─────────────────────────────────────────────────────
  function _build() {
    const r = new SR();
    r.lang = currentLang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      setActive(true);
      showInterim('🎤 Listening… speak now');
      console.log('[VoiceTyping] Started, lang:', currentLang);
    };

    r.onresult = event => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText) {
        _interimBuffer = '';
        clearTimeout(_interimFlushTimer); _interimFlushTimer = null;
        insertText(finalText + ' ');
        hideInterim();
      } else if (interimText) {
        // Keep interim buffered — Tamil recognition often never marks isFinal.
        // Flush via onspeechend OR via timer after 1.5 s of silence (ta-IN quirk:
        // onspeechend is unreliable in Chrome continuous mode for Tamil).
        _interimBuffer = interimText;
        showInterim('🎤 ' + interimText);
        clearTimeout(_interimFlushTimer);
        _interimFlushTimer = setTimeout(() => {
          _interimFlushTimer = null;
          if (_interimBuffer) {
            insertText(_interimBuffer + ' ');
            _interimBuffer = '';
            hideInterim();
          }
        }, 1500);
      }
    };

    r.onspeechend = () => {
      // Insert the buffered interim text if the API never sent isFinal:true.
      // Also cancel the timer — we're flushing right now.
      clearTimeout(_interimFlushTimer); _interimFlushTimer = null;
      if (_interimBuffer) {
        insertText(_interimBuffer + ' ');
        _interimBuffer = '';
      }
      hideInterim();
    };

    r.onerror = event => {
      console.warn('[VoiceTyping] Error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        isListening = false;
        setActive(false);
        hideInterim();
        alert(
          'Microphone access was denied.\n\n' +
          'To fix: click the lock/camera icon in the browser address bar → ' +
          'set Microphone to "Allow" → reload the page.'
        );
        return;
      }
      if (event.error === 'network') {
        isListening = false;
        setActive(false);
        hideInterim();
        alert('Voice typing needs an internet connection. Please check your connection.');
        return;
      }
      // 'no-speech', 'audio-capture', 'aborted' — let onend handle restart
    };

    r.onend = () => {
      _rec = null;
      if (isListening) {
        // Auto-restart with a short delay (avoid tight loops)
        setTimeout(() => {
          if (isListening) _rec = _build();
        }, 250);
      } else {
        setActive(false);
        hideInterim();
      }
    };

    try {
      r.start();
    } catch (e) {
      console.error('[VoiceTyping] start() threw:', e);
      _rec = null;
      if (isListening) {
        setTimeout(() => { if (isListening) _rec = _build(); }, 500);
      }
    }

    return r;
  }

  function startListening() {
    if (isListening) return;
    isListening = true;
    setActive(true);
    showInterim('🎤 Starting…');
    _rec = _build();
  }

  function stopListening() {
    isListening = false;
    _interimBuffer = '';
    clearTimeout(_interimFlushTimer); _interimFlushTimer = null;
    setActive(false);
    hideInterim();
    if (_rec) {
      try { _rec.stop(); } catch (_) {}
      _rec = null;
    }
  }

  function toggle() {
    if (isListening) stopListening();
    else startListening();
  }

  function setLanguage(lang) {
    currentLang = lang;
    updateLangUI(lang);
    // If already listening, restart with new language
    if (isListening) {
      stopListening();
      setTimeout(startListening, 300);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.voiceTyping = { toggle, stop: stopListening, setLanguage, isListening: () => isListening };

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = `
    /* Mic button active: red background + ring pulse */
    .voice-mic-btn.voice-typing-active {
      background: #dc2626 !important;
      animation: voice-btn-ring 1.2s ease-out infinite;
    }
    .voice-mic-btn.voice-typing-active:hover {
      background: #b91c1c !important;
    }
    @keyframes voice-btn-ring {
      0%   { box-shadow: 0 0 0 0   rgba(220, 38, 38, 0.55); }
      70%  { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
      100% { box-shadow: 0 0 0 0   rgba(220, 38, 38, 0); }
    }

    /* Mic SVG body: outline → filled when recording */
    .voice-mic-btn svg path:first-child {
      fill: none;
      transition: fill 0.15s;
    }
    .voice-mic-btn.voice-typing-active svg path:first-child {
      fill: white;
    }

    /* Fallback for toolbar-btn style voice buttons */
    .toolbar-btn.voice-typing-btn.voice-typing-active {
      color: #dc2626 !important;
      background: #fef2f2 !important;
    }
    .toolbar-btn.voice-typing-btn.voice-typing-active svg {
      animation: voice-icon-pulse 1.1s ease-in-out infinite;
    }
    @keyframes voice-icon-pulse {
      0%, 100% { transform: scale(1);    opacity: 1; }
      50%       { transform: scale(0.88); opacity: 0.6; }
    }

    /* Interim floating banner */
    #voice-interim-banner {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(14px);
      background: rgba(15, 15, 15, 0.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: #fff;
      padding: 10px 24px;
      border-radius: 999px;
      font-size: 15px;
      line-height: 1.5;
      max-width: min(560px, 88vw);
      text-align: center;
      z-index: 99999;
      pointer-events: none;
      font-family: 'Noto Sans Tamil', 'Latha', system-ui, sans-serif;
      box-shadow: 0 6px 32px rgba(0, 0, 0, 0.32);
      opacity: 0;
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    #voice-interim-banner.voice-interim-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* Small lang pill buttons */
    .voice-lang-btn {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 5px;
      border: 1px solid #d1d5db;
      background: transparent;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.15s;
      line-height: 1.5;
    }
    .voice-lang-btn:hover { background: #f3f4f6; color: #111827; border-color: #9ca3af; }
    .voice-lang-btn.voice-lang-active {
      background: #eff6ff; color: #1d4ed8;
      border-color: #93c5fd; font-weight: 600;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

})();
