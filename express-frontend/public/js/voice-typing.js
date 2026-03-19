/**
 * Voice Typing — Tamil Proofreading Platform
 * Uses the Web Speech API to transcribe spoken words into the active editor.
 *
 * Root causes fixed in this version
 * ──────────────────────────────────────────────────────────────────────────────
 * 1. onspeechend double-insertion (CRITICAL)
 *    Chrome fires onspeechend for *within-phrase* pauses in continuous mode.
 *    The old code flushed _interimBuffer on onspeechend, then recognition
 *    continued and re-delivered the same transcript as a new interim result.
 *    The 1.5 s timer then fired and inserted the text a second time.
 *    Fix: onspeechend only hides the interim banner; flushing happens on
 *    onend (session boundary) and isFinal results only.
 *
 * 2. execCommand silent success (MEDIUM)
 *    document.execCommand('insertText') can return true without inserting on
 *    newer Chrome builds if focus assertion fails silently.
 *    Fix: check document.activeElement before calling execCommand; fall through
 *    to DOM-range and append strategies if focus is wrong.
 *
 * 3. alert() for errors (MEDIUM)
 *    alert() blocks the tab, prevents cleanup, and is poor UX.
 *    Fix: replaced with a non-blocking toast notification.
 *
 * 4. setActive() always says "speak in Tamil" (MEDIUM)
 *    Fix: title reflects the current language.
 *
 * 5. Dead code: voice-icon-off / voice-icon-on IDs don't exist (MINOR)
 *    Fix: removed. CSS .voice-typing-active handles all visual state.
 *
 * 6. Tab hidden → recognition silently dies, button stays red (MEDIUM)
 *    Fix: visibilitychange listener stops recognition when tab is hidden.
 *
 * Public API  (window.voiceTyping)
 * ──────────────────────────────────────────────────────────────────────────────
 *   .toggle()           — start if stopped, stop if started
 *   .start()            — start listening
 *   .stop()             — stop listening (flushes any buffered text first)
 *   .setLanguage(lang)  — 'ta-IN' | 'ta' → Tamil; anything else → 'en-US'
 *   .isListening()      — returns boolean
 */
(function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ── Unsupported browser ───────────────────────────────────────────────────
  if (!SR) {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.voice-typing-btn, .voice-mic-btn').forEach(btn => {
        btn.title = 'Voice typing requires Google Chrome or Microsoft Edge.';
        btn.style.opacity = '0.45';
        btn.style.cursor = 'not-allowed';
        btn.onclick = (e) => {
          e.preventDefault();
          _showToast(
            'Voice typing requires Google Chrome or Microsoft Edge. ' +
            'Please open this page in Chrome to use voice typing.',
            'error',
            5000
          );
        };
      });
    });
    return;
  }

  // ── Module state ──────────────────────────────────────────────────────────
  let _isListening    = false;
  let _currentLang    = 'ta-IN';
  let _rec            = null;   // current SpeechRecognition instance
  let _banner         = null;   // interim floating banner element
  let _savedRange     = null;   // last known caret range in the editor

  // Interim buffer (Tamil recognition rarely delivers isFinal:true)
  let _interimBuffer     = '';
  let _interimFlushTimer = null;
  let _lastInterimText   = '';   // detect stalled recognition (same text re-delivered)
  let _maxHoldTimer      = null; // absolute ceiling: flush even during continuous speech

  // no-speech loop guard: stop auto-restart after N consecutive no-speech errors
  let _noSpeechCount = 0;

  // Toast
  let _toastEl    = null;
  let _toastTimer = null;

  // ── Toast notification (replaces alert) ───────────────────────────────────
  function _showToast(msg, type, durationMs) {
    type       = type       || 'info';
    durationMs = durationMs || 4000;

    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.id = 'voice-toast';
      Object.assign(_toastEl.style, {
        position:    'fixed',
        bottom:      '72px',
        left:        '50%',
        transform:   'translateX(-50%) translateY(10px)',
        padding:     '10px 20px',
        borderRadius:'10px',
        fontSize:    '14px',
        lineHeight:  '1.5',
        maxWidth:    'min(440px, 90vw)',
        textAlign:   'center',
        zIndex:      '99998',
        pointerEvents:'none',
        opacity:     '0',
        transition:  'opacity 0.22s ease, transform 0.22s ease',
        fontFamily:  "'Noto Sans Tamil', 'Latha', system-ui, sans-serif",
        boxShadow:   '0 4px 20px rgba(0,0,0,0.25)',
      });
      document.body.appendChild(_toastEl);
    }

    clearTimeout(_toastTimer);
    var palette = {
      info:    { bg: 'rgba(15,15,15,0.9)',   fg: '#fff' },
      error:   { bg: 'rgba(185,28,28,0.93)', fg: '#fff' },
      success: { bg: 'rgba(21,128,61,0.93)', fg: '#fff' },
      warn:    { bg: 'rgba(146,64,14,0.93)', fg: '#fff' },
    };
    var c = palette[type] || palette.info;
    _toastEl.style.background = c.bg;
    _toastEl.style.color      = c.fg;
    _toastEl.textContent      = msg;
    // Animate in
    _toastEl.style.opacity   = '0';
    _toastEl.style.transform = 'translateX(-50%) translateY(10px)';
    requestAnimationFrame(function () {
      _toastEl.style.opacity   = '1';
      _toastEl.style.transform = 'translateX(-50%) translateY(0)';
    });
    _toastTimer = setTimeout(function () {
      _toastEl.style.opacity   = '0';
      _toastEl.style.transform = 'translateX(-50%) translateY(10px)';
    }, durationMs);
  }

  // ── Editor accessors ──────────────────────────────────────────────────────
  function _getTipTap() {
    if (!window.USE_TIPTAP_EDITOR) return null;
    var getter = window.tiptapWorkspaceEditor;
    if (typeof getter === 'function') return getter();
    if (getter && typeof getter.commands === 'object') return getter;
    return null;
  }

  function _getContentEditable() {
    var el = document.getElementById('editor');
    if (el && !el.classList.contains('hidden')) return el;
    el = document.getElementById('home-editor');
    if (el) return el;
    return null;
  }

  // ── Selection save / restore ──────────────────────────────────────────────
  function _saveRange() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    var range    = sel.getRangeAt(0);
    var editorEl = _getContentEditable();
    // Only save ranges that are inside a known editor element
    if (editorEl && (editorEl === range.commonAncestorContainer ||
                     editorEl.contains(range.commonAncestorContainer))) {
      _savedRange = range.cloneRange();
    }
  }

  function _restoreRange(el) {
    if (!el) return false;
    el.focus();
    if (_savedRange) {
      try {
        // Verify the saved range nodes are still in the DOM
        var ancestor = _savedRange.commonAncestorContainer;
        if (document.contains(ancestor) && el.contains(ancestor)) {
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(_savedRange);
          return true;
        }
      } catch (_) {
        // Stale range — fall through
      }
    }
    // Fallback: cursor at end of editor
    var sel = window.getSelection();
    if (sel) {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return false;
  }

  function _attachSelectionListeners() {
    ['#editor', '#home-editor'].forEach(function (selector) {
      var el = document.querySelector(selector);
      if (!el) return;
      el.addEventListener('keyup',    _saveRange);
      el.addEventListener('mouseup',  _saveRange);
      el.addEventListener('touchend', _saveRange);
      // Most important: save on blur so we capture caret before mic button
      // steals focus.
      el.addEventListener('blur',     _saveRange);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _attachSelectionListeners);
  } else {
    _attachSelectionListeners();
  }

  // ── Text insertion ────────────────────────────────────────────────────────
  function _insertText(text) {
    if (!text || !text.trim()) return;

    // TipTap path (when USE_TIPTAP_EDITOR = true)
    var tiptap = _getTipTap();
    if (tiptap) {
      tiptap.chain().focus().insertContent(text).run();
      return;
    }

    // contenteditable path
    var el = _getContentEditable();
    if (!el) {
      console.warn('[VoiceTyping] No editor element found — cannot insert text');
      return;
    }

    // Restore cursor (focuses el, places caret at saved or end position)
    _restoreRange(el);

    var inserted = false;

    // ── Strategy 1: execCommand (undo-safe, respects caret) ──────────────────
    // Only call execCommand when the element is actually focused; otherwise
    // it returns true silently without inserting.
    if (!inserted &&
        typeof document.execCommand === 'function' &&
        (document.activeElement === el || el.contains(document.activeElement))) {
      try {
        var ok = document.execCommand('insertText', false, text);
        if (ok) {
          inserted = true;
        }
      } catch (_) {}
    }

    // ── Strategy 2: DOM Range insertion (robust fallback) ────────────────────
    if (!inserted) {
      try {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          var range    = sel.getRangeAt(0);
          var ancestor = range.commonAncestorContainer;
          if (el === ancestor || el.contains(ancestor)) {
            range.deleteContents();
            var textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            sel.removeAllRanges();
            sel.addRange(range);
            inserted = true;
          }
        }
      } catch (_) {}
    }

    // ── Strategy 3: Append to last block element (guaranteed fallback) ────────
    if (!inserted) {
      try {
        var target   = el;
        var lastChild = el.lastChild;
        if (lastChild && lastChild.nodeType === Node.ELEMENT_NODE &&
            /^(P|DIV|SPAN|LI)$/.test(lastChild.nodeName)) {
          target = lastChild;
        }
        target.appendChild(document.createTextNode(text));
        inserted = true;
      } catch (e) {
        console.error('[VoiceTyping] All insertion strategies failed:', e);
      }
    }

    if (inserted) {
      _saveRange();
      // Notify workspace.js of the content change (triggers word count, etc.)
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ── Interim banner ────────────────────────────────────────────────────────
  function _showInterim(text) {
    if (!_banner) {
      _banner = document.createElement('div');
      _banner.id = 'voice-interim-banner';
      _banner.setAttribute('aria-live', 'polite');
      document.body.appendChild(_banner);
    }
    _banner.textContent = text || '';
    _banner.classList.toggle('voice-interim-visible', Boolean(text));
  }

  function _hideInterim() {
    if (_banner) _banner.classList.remove('voice-interim-visible');
  }

  // ── Button state ──────────────────────────────────────────────────────────
  function _setActive(active) {
    document.querySelectorAll('.voice-typing-btn, .voice-mic-btn').forEach(function (btn) {
      btn.classList.toggle('voice-typing-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    // Update tooltip to reflect current language
    var langLabel = _currentLang === 'ta-IN' ? 'Tamil' : 'English';
    var micBtn = document.getElementById('voice-mic-btn');
    if (micBtn) {
      micBtn.title = active
        ? ('Stop voice typing (' + langLabel + ') — click to stop')
        : ('Voice typing — click to dictate in ' + langLabel);
      micBtn.setAttribute('aria-label',
        active ? 'Stop voice typing' : 'Start voice typing');
    }
  }

  // ── Language pill UI ──────────────────────────────────────────────────────
  function _updateLangUI(lang) {
    var toggle = document.getElementById('voice-lang-toggle');
    if (toggle) {
      var isTamil = lang === 'ta-IN';
      toggle.setAttribute('aria-checked', isTamil ? 'true' : 'false');
      toggle.querySelector('.voice-lang-toggle-label').textContent =
        isTamil ? 'தமிழ்' : 'English';
      toggle.title = isTamil
        ? 'Tamil voice input — click to switch to English'
        : 'English voice input — click to switch to Tamil';
    }
    // Legacy small pill buttons (if present)
    document.querySelectorAll('.voice-lang-btn').forEach(function (btn) {
      btn.classList.toggle('voice-lang-active', btn.getAttribute('data-lang') === lang);
    });
  }

  // ── Buffer management ─────────────────────────────────────────────────────
  function _clearBuffers() {
    _interimBuffer   = '';
    _lastInterimText = '';
    clearTimeout(_interimFlushTimer);
    clearTimeout(_maxHoldTimer);
    _interimFlushTimer = null;
    _maxHoldTimer      = null;
  }

  /**
   * Schedule the silence-flush timer.
   * Uses a shorter delay for longer buffers so fast speakers get faster commits.
   *   ≤ 80 chars  → 800 ms (normal pace)
   *   81–160 chars → 500 ms (faster commit)
   *   > 160 chars  → 300 ms (bulk text, commit quickly)
   *
   * Also arms a max-hold timer (3 s absolute ceiling) so a non-stop speaker
   * never waits more than 3 s to see text appear.
   */
  function _scheduleFlushTimer(charCount) {
    clearTimeout(_interimFlushTimer);
    var delay = charCount > 160 ? 300 : charCount > 80 ? 500 : 800;
    _interimFlushTimer = setTimeout(function () {
      _interimFlushTimer = null;
      if (_isListening) _flushBuffer('timer');
    }, delay);

    if (!_maxHoldTimer) {
      _maxHoldTimer = setTimeout(function () {
        _maxHoldTimer = null;
        if (_isListening && _interimBuffer) _flushBuffer('maxhold');
      }, 3000);
    }
  }

  /**
   * Flush the interim buffer.
   * Called by:
   *   - the silence timer (primary path for Tamil)
   *   - the max-hold timer (forces commit during continuous speech)
   *   - onend (session boundary — covers the case where timer didn't fire yet)
   *   - stopListening (user manually stops)
   *
   * NOT called by onspeechend — that's the key fix for double-insertion.
   */
  function _flushBuffer(source) {
    var text = _interimBuffer.trim();
    _clearBuffers();
    _hideInterim();
    if (!text) return;
    console.log('[VoiceTyping] Flushing buffer (' + source + '):', text.slice(0, 60));
    _insertText(text + ' ');
  }

  // ── SpeechRecognition instance builder ────────────────────────────────────
  function _build() {
    var r      = new SR();
    r.lang     = _currentLang;
    r.continuous      = true;
    r.interimResults  = true;
    r.maxAlternatives = 1;

    r.onstart = function () {
      _setActive(true);
      var langName = _currentLang === 'ta-IN' ? 'Tamil' : 'English';
      _showInterim('🎤 Listening in ' + langName + '… speak now');
      console.log('[VoiceTyping] Started, lang:', _currentLang);
    };

    r.onresult = function (event) {
      // Any successful result means the mic is working — reset the no-speech counter
      _noSpeechCount = 0;

      var finalText   = '';
      var interimText = '';

      for (var i = event.resultIndex; i < event.results.length; i++) {
        var t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += t;
        } else {
          interimText += t;
        }
      }

      if (finalText) {
        // Got a definitive result (common in English; rare in Tamil).
        // Clear interim state and insert immediately.
        _clearBuffers();
        _hideInterim();
        var clean = finalText.trim();
        if (clean) {
          _insertText(clean + ' ');
        }
        // FIX: the same event can carry NEW interim text for the NEXT phrase
        // (fast speaker already started the next sentence). Don't discard it.
        if (interimText) {
          _interimBuffer   = interimText;
          _lastInterimText = interimText;
          _showInterim('🎤 ' + interimText);
          _scheduleFlushTimer(interimText.length);
        }
      } else if (interimText) {
        // Accumulate interim transcript.
        // ── CRITICAL: do NOT flush here or on onspeechend ──
        // Chrome fires onspeechend for within-phrase pauses in continuous mode,
        // then re-delivers the same interim text. Flushing there caused double-
        // insertion. The silence timer + onend are the correct flush points.
        _interimBuffer = interimText;
        _showInterim('🎤 ' + interimText);

        if (interimText !== _lastInterimText) {
          // Text actually changed → restart the silence timer.
          _lastInterimText = interimText;
          _scheduleFlushTimer(interimText.length);
        }
        // If interimText === _lastInterimText the recognition API is re-delivering
        // the same stalled transcript. Don't reset the timer — let it fire naturally.
      }
    };

    r.onspeechend = function () {
      // In continuous mode, onspeechend is not a session boundary — recognition
      // keeps running. Only hide the interim banner; the timer or onend will flush.
      console.log('[VoiceTyping] onspeechend — waiting for timer or isFinal result');
      _hideInterim();
    };

    r.onerror = function (event) {
      console.warn('[VoiceTyping] Error:', event.error);

      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          _isListening = false;
          _setActive(false);
          _hideInterim();
          _clearBuffers();
          _showToast(
            'Microphone access denied. ' +
            'Click the 🔒 icon in the address bar → ' +
            'set Microphone to "Allow" → reload the page.',
            'error',
            7000
          );
          break;

        case 'network':
          _isListening = false;
          _setActive(false);
          _hideInterim();
          _clearBuffers();
          _showToast(
            'Voice typing requires an internet connection. ' +
            'Please check your network and try again.',
            'error'
          );
          break;

        case 'audio-capture':
          _isListening = false;
          _setActive(false);
          _hideInterim();
          _clearBuffers();
          _showToast(
            'Microphone unavailable. ' +
            'Check that your microphone is connected and not in use by another app.',
            'error'
          );
          break;

        case 'no-speech':
          _noSpeechCount++;
          if (_noSpeechCount >= 2) {
            // Two consecutive no-speech errors → stop the loop entirely.
            // Setting _isListening = false here causes onend to call _setActive(false)
            // instead of auto-restarting, breaking the infinite cycle.
            _isListening = false;
            _setActive(false);
            _hideInterim();
            _clearBuffers();
            _showToast(
              'No speech heard. Check your microphone and click the mic button to try again.',
              'error',
              6000
            );
          } else {
            // First occurrence — gentle hint; let onend restart once more.
            _showToast('No speech detected. Try speaking closer to your microphone.', 'warn', 3000);
          }
          break;

        case 'aborted':
          // Triggered by our own .stop() call — not an error to surface
          break;

        default:
          console.warn('[VoiceTyping] Unhandled recognition error:', event.error);
          // Let onend handle restart / cleanup
          break;
      }
    };

    r.onend = function () {
      // Session boundary — flush any remaining interim buffer before restarting.
      // This is the SAFE flush point (recognition has fully stopped for this session).
      _flushBuffer('onend');
      _rec = null;

      if (_isListening) {
        // Auto-restart (Chrome continuous mode caps out at ~60 s; also restarts
        // after transient errors like 'no-speech').
        // 100 ms gap (was 250 ms) — shorter gap = fewer words missed during restart.
        setTimeout(function () {
          if (_isListening) {
            console.log('[VoiceTyping] Auto-restart');
            _rec = _build();
          }
        }, 100);
      } else {
        _setActive(false);
        _hideInterim();
      }
    };

    try {
      r.start();
    } catch (e) {
      console.error('[VoiceTyping] r.start() threw:', e.name, e.message);
      // 'InvalidStateError' = already started (rapid double-call guard)
      setTimeout(function () {
        if (_isListening) _rec = _build();
      }, 500);
    }

    return r;
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  function _startListening() {
    if (_isListening) return;

    // Guard: recognition fails silently in hidden tabs
    if (document.hidden) {
      _showToast('Switch to this tab first, then click the mic to start voice typing.', 'info');
      return;
    }

    _isListening   = true;
    _noSpeechCount = 0;  // fresh budget when user manually starts
    _clearBuffers();     // also resets _lastInterimText and _maxHoldTimer
    _setActive(true);
    _showInterim('🎤 Starting…');
    _rec = _build();
  }

  function _stopListening() {
    _isListening = false;
    // Flush buffered interim text before stopping so the user doesn't lose it
    _flushBuffer('stop');
    _setActive(false);
    _hideInterim();
    if (_rec) {
      try { _rec.stop(); } catch (_) {}
      _rec = null;
    }
  }

  function _toggle() {
    if (_isListening) _stopListening();
    else _startListening();
  }

  function _setLanguage(lang) {
    // Normalise: 'ta-IN', 'ta', 'ta_IN', etc. → 'ta-IN'; everything else → 'en-US'
    var normalised = /^ta/i.test(lang) ? 'ta-IN' : 'en-US';

    var changed = normalised !== _currentLang;
    _currentLang = normalised;
    _updateLangUI(normalised);

    if (changed && _isListening) {
      // Restart with the new locale
      _stopListening();
      setTimeout(_startListening, 300);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.voiceTyping = {
    toggle:      _toggle,
    start:       _startListening,
    stop:        _stopListening,
    setLanguage: _setLanguage,
    isListening: function () { return _isListening; },
  };

  // ── Tab visibility: stop mic when tab goes to background ──────────────────
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && _isListening) {
      _showToast('Voice typing paused — tab switched to background.', 'info', 3000);
      _stopListening();
    }
  });

  // ── Injected CSS ──────────────────────────────────────────────────────────
  var css = [
    /* Mic button active: red background + pulse ring */
    '.voice-mic-btn.voice-typing-active {',
    '  background: #dc2626 !important;',
    '  animation: voice-btn-ring 1.2s ease-out infinite;',
    '}',
    '.voice-mic-btn.voice-typing-active:hover {',
    '  background: #b91c1c !important;',
    '}',
    '@keyframes voice-btn-ring {',
    '  0%   { box-shadow: 0 0 0 0px  rgba(220,38,38,0.55); }',
    '  70%  { box-shadow: 0 0 0 10px rgba(220,38,38,0); }',
    '  100% { box-shadow: 0 0 0 0px  rgba(220,38,38,0); }',
    '}',

    /* Mic SVG fill: outline → filled mic body when recording */
    '.voice-mic-btn svg path:first-child { fill: none; transition: fill 0.15s; }',
    '.voice-mic-btn.voice-typing-active svg path:first-child { fill: currentColor; }',

    /* Toolbar-style voice buttons (fallback) */
    '.toolbar-btn.voice-typing-btn.voice-typing-active {',
    '  color: #dc2626 !important; background: #fef2f2 !important;',
    '}',
    '.toolbar-btn.voice-typing-btn.voice-typing-active svg {',
    '  animation: voice-icon-pulse 1.1s ease-in-out infinite;',
    '}',
    '@keyframes voice-icon-pulse {',
    '  0%, 100% { transform: scale(1);    opacity: 1; }',
    '  50%       { transform: scale(0.88); opacity: 0.6; }',
    '}',

    /* Interim floating banner */
    '#voice-interim-banner {',
    '  position: fixed; bottom: 28px; left: 50%;',
    '  transform: translateX(-50%) translateY(14px);',
    '  background: rgba(15,15,15,0.88);',
    '  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);',
    '  color: #fff; padding: 10px 24px; border-radius: 999px;',
    '  font-size: 15px; line-height: 1.5;',
    '  max-width: min(560px, 88vw); text-align: center;',
    '  z-index: 99999; pointer-events: none;',
    "  font-family: 'Noto Sans Tamil', 'Latha', system-ui, sans-serif;",
    '  box-shadow: 0 6px 32px rgba(0,0,0,0.32);',
    '  opacity: 0; transition: opacity 0.18s ease, transform 0.18s ease;',
    '}',
    '#voice-interim-banner.voice-interim-visible {',
    '  opacity: 1; transform: translateX(-50%) translateY(0);',
    '}',

    /* Small lang pill buttons (legacy) */
    '.voice-lang-btn {',
    '  font-size:11px; padding:2px 8px; border-radius:5px;',
    '  border:1px solid #d1d5db; background:transparent;',
    '  color:#6b7280; cursor:pointer; transition:all 0.15s; line-height:1.5;',
    '}',
    '.voice-lang-btn:hover { background:#f3f4f6; color:#111827; border-color:#9ca3af; }',
    '.voice-lang-btn.voice-lang-active {',
    '  background:#eff6ff; color:#1d4ed8; border-color:#93c5fd; font-weight:600;',
    '}',
  ].join('\n');

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

})();
