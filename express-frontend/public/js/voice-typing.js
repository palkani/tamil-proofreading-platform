/**
 * Voice Typing — Tamil Proofreading Platform
 *
 * Uses the Web Speech API (SpeechRecognition) to transcribe spoken audio
 * directly into the active rich text editor (TipTap or contenteditable).
 *
 * Supported languages: Tamil (ta-IN), English (en-US)
 * Browser support: Chrome 33+, Edge 79+, Safari 14.1+ (webkitSpeechRecognition)
 */
(function () {
  'use strict';

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  // ── Unsupported browser fallback ─────────────────────────────────────────
  if (!SpeechRecognition) {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.voice-typing-btn').forEach((btn) => {
        btn.title =
          'Voice typing is not supported in this browser. Please use Chrome or Edge.';
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
        btn.onclick = (e) => {
          e.preventDefault();
          alert(
            'Voice typing requires Chrome or Edge browser.\n\nPlease open this page in Google Chrome for voice typing support.'
          );
        };
      });
    });
    return;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let recognition = null;
  let isListening = false;
  let currentLang = 'ta-IN';
  let interimBanner = null;
  let _restartGuard = false; // prevents double-restart

  // ── Editor integration ────────────────────────────────────────────────────
  /**
   * Returns the active editor descriptor: { type: 'tiptap'|'contenteditable', el }
   * Priority: TipTap workspace → legacy contenteditable → home contenteditable
   */
  function getActiveEditor() {
    // TipTap workspace editor
    if (window.USE_TIPTAP_EDITOR && window.tiptapWorkspaceEditor) {
      return { type: 'tiptap', el: null };
    }
    // Legacy workspace editor
    const legacyEl = document.getElementById('editor');
    if (legacyEl && !legacyEl.classList.contains('hidden')) {
      return { type: 'contenteditable', el: legacyEl };
    }
    // Home page editor
    const homeEl = document.getElementById('home-editor');
    if (homeEl) {
      return { type: 'contenteditable', el: homeEl };
    }
    return null;
  }

  /**
   * Insert `text` at the current cursor position in the active editor.
   * Appends a space after each final transcript so words don't run together.
   */
  function insertText(text) {
    const editor = getActiveEditor();
    if (!editor) return;

    if (editor.type === 'tiptap') {
      // TipTap: chain().focus() ensures the editor has focus before inserting
      window.tiptapWorkspaceEditor
        .chain()
        .focus()
        .insertContent(text)
        .run();
    } else {
      // contenteditable: focus first, then use execCommand for undo-safe insertion
      editor.el.focus();
      if (!document.execCommand('insertText', false, text)) {
        // execCommand fallback (Firefox, older Safari)
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
    }
  }

  // ── Interim banner ────────────────────────────────────────────────────────
  function getOrCreateBanner() {
    if (interimBanner) return interimBanner;

    interimBanner = document.createElement('div');
    interimBanner.id = 'voice-interim-banner';
    interimBanner.setAttribute('aria-live', 'polite');
    interimBanner.setAttribute('aria-label', 'Voice recognition transcript');
    document.body.appendChild(interimBanner);
    return interimBanner;
  }

  function showInterim(text) {
    const el = getOrCreateBanner();
    el.textContent = text || '';
    el.classList.toggle('voice-interim-visible', Boolean(text));
  }

  function hideInterim() {
    if (interimBanner) {
      interimBanner.classList.remove('voice-interim-visible');
    }
  }

  // ── Button state ──────────────────────────────────────────────────────────
  function setButtonActive(active) {
    document.querySelectorAll('.voice-typing-btn').forEach((btn) => {
      btn.classList.toggle('voice-typing-active', active);
      btn.setAttribute(
        'title',
        active ? 'Stop voice typing (click to stop)' : 'Voice typing — speak in Tamil'
      );
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // ── SpeechRecognition lifecycle ───────────────────────────────────────────
  function buildRecognition() {
    const r = new SpeechRecognition();
    r.lang = currentLang;
    r.continuous = true;       // keep listening after pauses
    r.interimResults = true;   // show live partial transcripts
    r.maxAlternatives = 1;

    r.onstart = () => {
      _restartGuard = false;
      setButtonActive(true);
      showInterim('🎤 Listening… speak now');
    };

    r.onresult = (event) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        // Insert final text with a trailing space so next word is separate
        insertText(finalText + ' ');
        hideInterim();
      } else if (interimText) {
        showInterim('🎤 ' + interimText);
      }
    };

    r.onspeechend = () => {
      // Hide interim preview on speech pause (final result will follow)
      hideInterim();
    };

    r.onerror = (event) => {
      console.warn('[VoiceTyping] Error:', event.error);

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stopListening();
        alert(
          'Microphone access was denied.\n\n' +
            'To enable voice typing:\n' +
            '1. Click the lock icon in the address bar\n' +
            '2. Allow "Microphone" access\n' +
            '3. Reload the page and try again.'
        );
        return;
      }

      if (event.error === 'network') {
        stopListening();
        alert(
          'Voice typing requires an internet connection for Tamil recognition.\n\nPlease check your connection and try again.'
        );
        return;
      }

      // 'no-speech', 'audio-capture', 'aborted' — silently stop
      if (event.error !== 'no-speech') {
        stopListening();
      }
    };

    r.onend = () => {
      // Auto-restart if still meant to be listening (browser stops after silence)
      if (isListening && !_restartGuard) {
        _restartGuard = true;
        try {
          r.start();
        } catch (_) {
          // Already started — ignore
        }
      } else if (!isListening) {
        setButtonActive(false);
        hideInterim();
      }
    };

    return r;
  }

  function startListening() {
    if (!recognition) recognition = buildRecognition();
    recognition.lang = currentLang;

    try {
      recognition.start();
      isListening = true;
    } catch (e) {
      console.error('[VoiceTyping] Failed to start:', e);
    }
  }

  function stopListening() {
    isListening = false;
    setButtonActive(false);
    hideInterim();
    if (recognition) {
      try { recognition.stop(); } catch (_) {}
    }
  }

  // ── Language switch ───────────────────────────────────────────────────────
  function setLanguage(lang) {
    currentLang = lang;
    if (recognition) recognition.lang = lang;

    // Update language button labels
    document.querySelectorAll('.voice-lang-btn').forEach((btn) => {
      const btnLang = btn.getAttribute('data-lang');
      btn.classList.toggle('voice-lang-active', btnLang === lang);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function toggle(lang) {
    if (lang) setLanguage(lang);
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  window.voiceTyping = {
    toggle,
    stop: stopListening,
    setLanguage,
    isListening: () => isListening,
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = `
    /* Mic button active state */
    .voice-typing-btn.voice-typing-active {
      color: #dc2626 !important;
      background-color: #fef2f2 !important;
    }
    .voice-typing-btn.voice-typing-active .voice-mic-icon {
      animation: voice-mic-pulse 1.1s ease-in-out infinite;
    }
    @keyframes voice-mic-pulse {
      0%, 100% { transform: scale(1);    opacity: 1; }
      50%       { transform: scale(0.88); opacity: 0.65; }
    }

    /* Interim banner */
    #voice-interim-banner {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(12px);
      background: rgba(17, 17, 17, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #fff;
      padding: 10px 22px;
      border-radius: 999px;
      font-size: 15px;
      line-height: 1.5;
      max-width: min(600px, 90vw);
      text-align: center;
      z-index: 99999;
      pointer-events: none;
      font-family: 'Noto Sans Tamil', 'Latha', sans-serif;
      box-shadow: 0 4px 28px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    #voice-interim-banner.voice-interim-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* Language toggle buttons */
    .voice-lang-btn {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid #d1d5db;
      background: transparent;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.15s;
      line-height: 1.4;
    }
    .voice-lang-btn.voice-lang-active,
    .voice-lang-btn:hover {
      background: #f3f4f6;
      color: #111827;
      border-color: #9ca3af;
    }
    .voice-lang-btn.voice-lang-active {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #93c5fd;
      font-weight: 600;
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
})();
