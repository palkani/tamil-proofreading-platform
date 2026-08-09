/**
 * ProofTamil chatbot widget.
 *
 * Dependency-free vanilla JS with its own scoped CSS, loaded once from
 * views/partials/footer.ejs so it appears site-wide.
 *
 * XSS posture: assistant replies are rendered by BUILDING DOM NODES and
 * setting textContent — innerHTML is never used with model output. Raw HTML in
 * a reply therefore shows as visible characters rather than becoming markup.
 * Only http(s) URLs become anchors. Keep it that way.
 *
 * Styles are prefixed `ptc-` and scoped under #ptc-root so they cannot collide
 * with the site's Tailwind build, and so the widget survives a CSS rebuild.
 */
(function () {
  'use strict';

  if (window.__ptChatbotLoaded) return;
  window.__ptChatbotLoaded = true;

  var STORAGE_KEY = 'prooftamil.chatbot.v1';
  var MAX_CHARS = 2000;
  var TAMIL = /[஀-௿]/;

  /* ------------------------------------------------------------- strings */

  var STRINGS = {
    en: {
      launcherOpen: 'Open the ProofTamil assistant',
      launcherClose: 'Close the ProofTamil assistant',
      title: 'ProofTamil Assistant',
      subtitle: 'Ask about our Tamil writing tools',
      greeting:
        "Hi! I'm ProofBot. I can explain how ProofTamil's proofreader, handwriting OCR, content writer and Tanglish tools work — and answer questions about plans and accounts.",
      placeholder: 'Ask a question…',
      send: 'Send message',
      close: 'Close',
      thinking: 'ProofBot is typing',
      sources: 'Sources',
      netError: 'Sorry — I could not reach the assistant. Please try again.',
      leadTitle: 'Want us to follow up?',
      leadBody: 'Leave your email and the ProofTamil team will get back to you.',
      leadEmail: 'you@example.com',
      leadName: 'Your name',
      leadConsent: 'You can email me about ProofTamil.',
      leadPrivacy: 'We only use this to reply. No spam, and you can opt out any time.',
      leadSubmit: 'Send',
      leadSending: 'Sending…',
      leadDismiss: 'No thanks',
      leadSuccess: "Thank you — we've got it. The team will be in touch soon.",
      errEmail: 'Please enter a valid email address.',
      errConsent: 'Please tick the box so we know it’s okay to email you.',
      errGeneric: "That didn't go through. Please try again."
    },
    ta: {
      launcherOpen: 'ProofTamil உதவியாளரைத் திறக்க',
      launcherClose: 'ProofTamil உதவியாளரை மூட',
      title: 'ProofTamil உதவியாளர்',
      subtitle: 'எங்கள் தமிழ் எழுத்துக் கருவிகள் பற்றிக் கேளுங்கள்',
      greeting:
        'வணக்கம்! நான் ProofBot. ProofTamil-இன் திருத்தி, கையெழுத்து OCR, உள்ளடக்க எழுத்தாளர் மற்றும் தமிங்கிலக் கருவிகள் எப்படி வேலை செய்கின்றன என்பதையும், திட்டங்கள் மற்றும் கணக்கு பற்றிய கேள்விகளையும் விளக்க முடியும்.',
      placeholder: 'உங்கள் கேள்வியைக் கேளுங்கள்…',
      send: 'செய்தியை அனுப்பு',
      close: 'மூடு',
      thinking: 'ProofBot தட்டச்சு செய்கிறது',
      sources: 'ஆதாரங்கள்',
      netError: 'உதவியாளரைத் தொடர்பு கொள்ள முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
      leadTitle: 'நாங்கள் தொடர்பு கொள்ளலாமா?',
      leadBody: 'உங்கள் மின்னஞ்சலை விடுங்கள், ProofTamil குழு உங்களைத் தொடர்பு கொள்ளும்.',
      leadEmail: 'you@example.com',
      leadName: 'உங்கள் பெயர்',
      leadConsent: 'ProofTamil பற்றி எனக்கு மின்னஞ்சல் அனுப்பலாம்.',
      leadPrivacy:
        'பதிலளிக்க மட்டுமே இதைப் பயன்படுத்துகிறோம். ஸ்பேம் இல்லை, எப்போது வேண்டுமானாலும் விலகலாம்.',
      leadSubmit: 'அனுப்பு',
      leadSending: 'அனுப்புகிறது…',
      leadDismiss: 'வேண்டாம்',
      leadSuccess: 'நன்றி — கிடைத்தது. விரைவில் தொடர்பு கொள்கிறோம்.',
      errEmail: 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
      errConsent: 'மின்னஞ்சல் அனுப்ப அனுமதி அளிக்க பெட்டியைத் தேர்ந்தெடுக்கவும்.',
      errGeneric: 'அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்.'
    }
  };

  /**
   * Both languages are always shown regardless of UI language — a bilingual
   * audience should see straight away that Tamil is a first-class input.
   */
  var STARTERS = [
    { text: 'How does the Tamil proofreader work?', lang: 'en' },
    { text: 'விலை என்ன?', lang: 'ta' },
    { text: 'How do I convert handwritten notes to text?', lang: 'en' },
    { text: 'தமிங்கிலத்தை தமிழாக மாற்ற முடியுமா?', lang: 'ta' }
  ];

  var langs = navigator.languages || [navigator.language || 'en'];
  var isTamilUi = langs.some(function (l) {
    return String(l).toLowerCase().indexOf('ta') === 0;
  });
  var T = STRINGS[isTamilUi ? 'ta' : 'en'];

  /* ------------------------------------------------------------- storage */

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  var state = { sessionId: uuid(), open: false, messages: [], leadSubmitted: false };

  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        state.sessionId = typeof saved.sessionId === 'string' ? saved.sessionId : state.sessionId;
        state.open = saved.open === true;
        state.messages = Array.isArray(saved.messages) ? saved.messages : [];
        state.leadSubmitted = saved.leadSubmitted === true;
      }
    }
  } catch (e) {
    // Corrupt or unreadable storage (private mode, quota, hand-edited value)
    // must not take the widget down — start clean instead.
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Quota or private-browsing refusal. The conversation just will not
      // survive a reload; not worth surfacing.
    }
  }

  /* ------------------------------------------------------------ markdown */

  /** Only http(s) links become anchors. Blocks javascript:, data:, vbscript:. */
  function safeHref(raw) {
    try {
      var url = new URL(raw, window.location.origin);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function anchor(href, text) {
    var a = el('a', 'ptc-link', text);
    a.href = href;
    a.target = '_blank';
    // noopener defeats reverse-tabnabbing; noreferrer keeps the chat URL out of
    // the destination's referer log.
    a.rel = 'noopener noreferrer nofollow';
    return a;
  }

  var INLINE = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(`[^`]+`)|(https?:\/\/[^\s<>()]+)/g;

  /** Returns a DocumentFragment. Never a string — that is the XSS guarantee. */
  function renderInline(text) {
    var frag = document.createDocumentFragment();
    var cursor = 0;
    var match;
    INLINE.lastIndex = 0;

    while ((match = INLINE.exec(text)) !== null) {
      if (match.index > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      }
      var token = match[0];

      if (token.charAt(0) === '[') {
        var link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
        var href = link ? safeHref(link[2]) : null;
        // A rejected protocol degrades to the link's visible text — never a
        // clickable element, never silently dropped.
        if (href && link) frag.appendChild(anchor(href, link[1]));
        else frag.appendChild(document.createTextNode(link ? link[1] : token));
      } else if (token.slice(0, 2) === '**') {
        frag.appendChild(el('strong', null, token.slice(2, -2)));
      } else if (token.charAt(0) === '`') {
        frag.appendChild(el('code', 'ptc-code', token.slice(1, -1)));
      } else if (token.charAt(0) === '*') {
        frag.appendChild(el('em', null, token.slice(1, -1)));
      } else {
        var bare = safeHref(token);
        if (bare) frag.appendChild(anchor(bare, token));
        else frag.appendChild(document.createTextNode(token));
      }

      cursor = match.index + token.length;
    }

    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    return frag;
  }

  function renderMarkdown(text) {
    var wrap = document.createDocumentFragment();
    var blocks = text.split(/\n{2,}/).filter(function (b) {
      return b.trim();
    });

    blocks.forEach(function (block) {
      var lines = block.split('\n');
      var heading = /^(#{1,6})\s+(.*)$/.exec(lines[0]);

      if (heading && lines.length === 1) {
        var h = el('p', 'ptc-h');
        h.appendChild(renderInline(heading[2]));
        wrap.appendChild(h);
        return;
      }

      var allBullets = lines.every(function (l) {
        return /^\s*[-*•]\s+/.test(l);
      });
      var allNumbered = lines.every(function (l) {
        return /^\s*\d+[.)]\s+/.test(l);
      });

      if (allBullets || allNumbered) {
        var list = el(allBullets ? 'ul' : 'ol', 'ptc-list');
        lines.forEach(function (l) {
          var li = el('li');
          li.appendChild(renderInline(l.replace(allBullets ? /^\s*[-*•]\s+/ : /^\s*\d+[.)]\s+/, '')));
          list.appendChild(li);
        });
        wrap.appendChild(list);
        return;
      }

      var p = el('p', 'ptc-p');
      lines.forEach(function (l, i) {
        if (i > 0) p.appendChild(document.createElement('br'));
        p.appendChild(renderInline(l));
      });
      wrap.appendChild(p);
    });

    return wrap;
  }

  /* ---------------------------------------------------------------- css */

  var CSS = [
    '#ptc-root{position:fixed;right:0;bottom:0;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:12px;',
    'padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom));padding-right:max(16px,env(safe-area-inset-right));',
    "font-family:Inter,'DM Sans',Poppins,ui-sans-serif,system-ui,sans-serif;}",
    '#ptc-root *{box-sizing:border-box;}',
    '.ptc-ta{font-family:"Noto Sans Tamil",Latha,"Nirmala UI",sans-serif;line-height:1.85;}',
    '.ptc-launcher{width:56px;height:56px;border-radius:9999px;border:0;background:#4F46E5;color:#fff;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;box-shadow:0 10px 25px rgba(15,23,42,.25);transition:transform .15s,background .15s;}',
    '.ptc-launcher:hover{background:#4338CA;}',
    '.ptc-launcher:focus-visible{outline:2px solid #4F46E5;outline-offset:2px;}',
    '.ptc-panel{width:min(384px,calc(100vw - 32px));height:min(544px,calc(100dvh - 96px));background:#fff;border:1px solid #E2E8F0;',
    'border-radius:16px;box-shadow:0 25px 50px -12px rgba(15,23,42,.35);display:flex;flex-direction:column;overflow:hidden;}',
    '.ptc-head{display:flex;align-items:center;gap:12px;background:#4F46E5;color:#fff;padding:12px 16px;}',
    '.ptc-avatar{width:32px;height:32px;border-radius:9999px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:0 0 auto;}',
    '.ptc-title{font-size:14px;font-weight:600;margin:0;}',
    '.ptc-sub{font-size:12px;margin:0;color:rgba(255,255,255,.8);}',
    '.ptc-x{margin-left:auto;background:transparent;border:0;color:#fff;cursor:pointer;padding:6px;border-radius:8px;display:flex;}',
    '.ptc-x:hover{background:rgba(255,255,255,.2);}',
    '.ptc-body{flex:1;overflow-y:auto;overscroll-behavior:contain;background:#F8FAFC;padding:12px 14px;}',
    '.ptc-bubble{max-width:92%;background:#fff;color:#0F172A;border-radius:12px;border-top-left-radius:4px;padding:10px 14px;font-size:14px;',
    'box-shadow:0 1px 2px rgba(15,23,42,.06);margin-bottom:12px;line-height:1.55;}',
    '.ptc-user{max-width:85%;margin-left:auto;background:#4F46E5;color:#fff;border-radius:12px;border-top-left-radius:12px;border-bottom-right-radius:4px;',
    'padding:10px 14px;font-size:14px;margin-bottom:12px;white-space:pre-wrap;word-break:break-word;line-height:1.55;}',
    '.ptc-err{background:#FEF2F2;color:#991B1B;}',
    '.ptc-p{margin:6px 0;}.ptc-p:first-child{margin-top:0;}.ptc-p:last-child{margin-bottom:0;}',
    '.ptc-h{margin:8px 0 4px;font-weight:600;}',
    '.ptc-list{margin:6px 0;padding-left:20px;}.ptc-list li{margin:3px 0;}',
    '.ptc-link{color:#4F46E5;text-decoration:underline;text-underline-offset:2px;}',
    '.ptc-link:hover{color:#4338CA;}',
    '.ptc-code{background:#EEF2FF;color:#4F46E5;border-radius:4px;padding:1px 4px;font-size:.9em;}',
    '.ptc-src{margin-top:10px;border-top:1px solid #E2E8F0;padding-top:8px;}',
    '.ptc-src-h{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748B;margin:0 0 4px;}',
    '.ptc-src a{display:block;font-size:12px;margin:2px 0;}',
    '.ptc-starters{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}',
    '.ptc-starter{text-align:left;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:8px 14px;font-size:14px;color:#0F172A;cursor:pointer;}',
    '.ptc-starter:hover{border-color:#4F46E5;background:#EEF2FF;}',
    '.ptc-typing{display:flex;gap:6px;padding:8px 4px;}',
    '.ptc-dot{width:6px;height:6px;border-radius:9999px;background:#94A3B8;animation:ptc-bounce 1.2s infinite;}',
    '.ptc-dot:nth-child(2){animation-delay:.15s;}.ptc-dot:nth-child(3){animation-delay:.3s;}',
    '@keyframes ptc-bounce{0%,60%,100%{transform:translateY(0);opacity:.5;}30%{transform:translateY(-5px);opacity:1;}}',
    '.ptc-foot{display:flex;gap:8px;align-items:flex-end;border-top:1px solid #E2E8F0;background:#fff;padding:10px 12px;}',
    '.ptc-input{flex:1;resize:none;min-height:40px;max-height:112px;border:1px solid #E2E8F0;border-radius:12px;background:#F8FAFC;',
    'padding:9px 12px;font-size:14px;font-family:inherit;color:#0F172A;outline:none;}',
    '.ptc-input:focus{border-color:#4F46E5;box-shadow:0 0 0 3px rgba(79,70,229,.15);}',
    '.ptc-send{width:40px;height:40px;flex:0 0 auto;border:0;border-radius:12px;background:#4F46E5;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
    '.ptc-send:disabled{opacity:.4;cursor:default;}',
    '.ptc-lead{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:12px 14px;margin-bottom:12px;}',
    '.ptc-lead h4{margin:0;font-size:14px;font-weight:600;color:#0F172A;}',
    '.ptc-lead p{margin:2px 0 0;font-size:12px;color:#64748B;}',
    '.ptc-field{width:100%;margin-top:8px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;padding:8px 12px;font-size:14px;font-family:inherit;outline:none;}',
    '.ptc-field:focus{border-color:#4F46E5;box-shadow:0 0 0 3px rgba(79,70,229,.15);}',
    '.ptc-consent{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:12px;color:#0F172A;}',
    '.ptc-consent input{margin-top:2px;accent-color:#4F46E5;width:16px;height:16px;flex:0 0 auto;}',
    '.ptc-priv{font-size:11px;color:#64748B;margin-top:8px;line-height:1.4;}',
    '.ptc-actions{display:flex;gap:8px;align-items:center;margin-top:10px;}',
    '.ptc-btn{background:#4F46E5;color:#fff;border:0;border-radius:8px;padding:7px 14px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;}',
    '.ptc-btn:disabled{opacity:.6;}',
    '.ptc-ghost{background:transparent;color:#64748B;border:0;padding:7px 10px;font-size:14px;cursor:pointer;font-family:inherit;}',
    '.ptc-alert{color:#DC2626;font-size:12px;margin-top:8px;}',
    '.ptc-ok{background:rgba(20,184,166,.1);border:1px solid rgba(20,184,166,.3);border-radius:12px;padding:10px 14px;font-size:14px;color:#0F172A;margin-bottom:12px;}',
    '@media (prefers-reduced-motion:reduce){#ptc-root *{animation:none!important;transition:none!important;}}'
  ].join('');

  /* --------------------------------------------------------------- build */

  function icon(paths, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('width', size || 22);
    svg.setAttribute('height', size || 22);
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
    });
    return svg;
  }

  var CHAT_ICON = ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z'];
  var X_ICON = ['M18 6 6 18', 'M6 6l12 12'];
  var SEND_ICON = ['m22 2-7 20-4-9-9-4 20-7Z'];

  function scriptClass(text) {
    return TAMIL.test(text) ? ' ptc-ta' : '';
  }

  var root, panel, body, input, sendBtn, launcher, streaming = false;

  function init() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // The site only declares Tamil via local() fonts, so Tamil renders only if
    // the visitor happens to have one installed. Load the real webfont.
    if (!document.querySelector('link[href*="Noto+Sans+Tamil"]')) {
      var font = document.createElement('link');
      font.rel = 'stylesheet';
      font.href =
        'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap';
      document.head.appendChild(font);
    }

    root = el('div');
    root.id = 'ptc-root';

    launcher = el('button', 'ptc-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', T.launcherOpen);
    launcher.setAttribute('aria-expanded', 'false');
    launcher.appendChild(icon(CHAT_ICON, 24));
    launcher.addEventListener('click', function () {
      setOpen(!state.open);
    });

    root.appendChild(launcher);
    document.body.appendChild(root);

    if (state.open) setOpen(true);
  }

  function buildPanel() {
    panel = el('div', 'ptc-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', T.title);

    var head = el('div', 'ptc-head');
    head.appendChild(el('div', 'ptc-avatar', 'PT'));
    var titles = el('div');
    titles.style.minWidth = '0';
    titles.appendChild(el('p', 'ptc-title' + scriptClass(T.title), T.title));
    titles.appendChild(el('p', 'ptc-sub' + scriptClass(T.subtitle), T.subtitle));
    head.appendChild(titles);

    var close = el('button', 'ptc-x');
    close.type = 'button';
    close.setAttribute('aria-label', T.close);
    close.appendChild(icon(X_ICON, 20));
    close.addEventListener('click', function () {
      setOpen(false);
    });
    head.appendChild(close);
    panel.appendChild(head);

    body = el('div', 'ptc-body');
    body.setAttribute('aria-live', 'polite');
    panel.appendChild(body);

    var foot = el('form', 'ptc-foot');
    input = el('textarea', 'ptc-input');
    input.rows = 1;
    input.maxLength = MAX_CHARS;
    input.placeholder = T.placeholder;
    input.setAttribute('aria-label', T.placeholder);
    input.addEventListener('input', function () {
      input.className = 'ptc-input' + scriptClass(input.value);
      sendBtn.disabled = !input.value.trim() || streaming;
    });
    input.addEventListener('keydown', function (event) {
      // Enter sends, Shift+Enter newlines. Never hijack Enter while an IME
      // composition is open or Tamil/Tanglish gets committed half-typed.
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    });

    sendBtn = el('button', 'ptc-send');
    sendBtn.type = 'submit';
    sendBtn.disabled = true;
    sendBtn.setAttribute('aria-label', T.send);
    sendBtn.appendChild(icon(SEND_ICON, 20));

    foot.appendChild(input);
    foot.appendChild(sendBtn);
    foot.addEventListener('submit', function (event) {
      event.preventDefault();
      submit();
    });
    panel.appendChild(foot);

    panel.addEventListener('keydown', trapFocus);
    root.insertBefore(panel, launcher);

    render();
  }

  /**
   * Focus trap. Without it, Tab walks out of an open dialog into the page
   * behind it, stranding keyboard and screen-reader users.
   */
  function trapFocus(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;

    var focusable = Array.prototype.filter.call(
      panel.querySelectorAll('a[href],button:not([disabled]),textarea,input:not([disabled]),[tabindex]:not([tabindex="-1"])'),
      function (node) {
        return node.offsetParent !== null;
      }
    );
    if (!focusable.length) return;

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setOpen(open) {
    state.open = open;
    save();

    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute('aria-label', open ? T.launcherClose : T.launcherOpen);
    launcher.textContent = '';
    launcher.appendChild(icon(open ? X_ICON : CHAT_ICON, open ? 20 : 24));

    if (open) {
      if (!panel) buildPanel();
      panel.style.display = 'flex';
      input.focus();
      // Opening with saved history must land on the newest message.
      body.scrollTop = body.scrollHeight;
    } else if (panel) {
      panel.style.display = 'none';
      launcher.focus();
    }
  }

  /* -------------------------------------------------------------- render */

  function render() {
    if (!body) return;
    body.textContent = '';

    var greet = el('div', 'ptc-bubble' + scriptClass(T.greeting), T.greeting);
    body.appendChild(greet);

    if (!state.messages.length) {
      var box = el('div', 'ptc-starters');
      STARTERS.forEach(function (starter) {
        var b = el('button', 'ptc-starter' + (starter.lang === 'ta' ? ' ptc-ta' : ''), starter.text);
        b.type = 'button';
        b.lang = starter.lang;
        b.addEventListener('click', function () {
          send(starter.text);
        });
        box.appendChild(b);
      });
      body.appendChild(box);
    }

    state.messages.forEach(function (message, index) {
      if (message.role === 'user') {
        body.appendChild(el('div', 'ptc-user' + scriptClass(message.content), message.content));
        return;
      }

      // The assistant turn is inserted empty and filled by the stream; showing
      // it before the first token gives a blank bubble above the typing dots.
      if (!message.content && !(message.sources || []).length) return;

      var bubble = el('div', 'ptc-bubble' + (message.error ? ' ptc-err' : '') + scriptClass(message.content));
      bubble.appendChild(renderMarkdown(message.content));

      if ((message.sources || []).length) {
        var src = el('div', 'ptc-src');
        src.appendChild(el('p', 'ptc-src-h', T.sources));
        message.sources.forEach(function (s) {
          var href = safeHref(s.url);
          if (href) src.appendChild(anchor(href, s.title || s.url));
        });
        bubble.appendChild(src);
      }
      body.appendChild(bubble);

      var isLast = index === state.messages.length - 1;
      if (isLast && message.leadCapture && !state.leadSubmitted && !streaming) {
        body.appendChild(buildLeadCard());
      }
    });

    if (streaming) {
      var last = state.messages[state.messages.length - 1];
      if (last && last.role === 'assistant' && !last.content) {
        var typing = el('div', 'ptc-typing');
        typing.setAttribute('role', 'status');
        typing.setAttribute('aria-label', T.thinking);
        typing.appendChild(el('span', 'ptc-dot'));
        typing.appendChild(el('span', 'ptc-dot'));
        typing.appendChild(el('span', 'ptc-dot'));
        body.appendChild(typing);
      }
    }

    body.scrollTop = body.scrollHeight;
  }

  /* ----------------------------------------------------------- lead card */

  function buildLeadCard() {
    var card = el('form', 'ptc-lead');
    card.setAttribute('aria-label', T.leadTitle);
    card.appendChild(el('h4' + '', null, T.leadTitle));
    card.appendChild(el('p', null, T.leadBody));

    var email = el('input', 'ptc-field');
    email.type = 'email';
    email.placeholder = T.leadEmail;
    email.setAttribute('aria-label', T.leadEmail);
    email.required = true;
    email.autocomplete = 'email';

    var name = el('input', 'ptc-field');
    name.type = 'text';
    name.placeholder = T.leadName;
    name.setAttribute('aria-label', T.leadName);
    name.autocomplete = 'name';

    var consentWrap = el('label', 'ptc-consent');
    var consent = document.createElement('input');
    consent.type = 'checkbox';
    consentWrap.appendChild(consent);
    consentWrap.appendChild(document.createTextNode(T.leadConsent));

    var alert = el('p', 'ptc-alert');
    alert.setAttribute('role', 'alert');
    alert.style.display = 'none';

    var actions = el('div', 'ptc-actions');
    var submitBtn = el('button', 'ptc-btn', T.leadSubmit);
    submitBtn.type = 'submit';
    var dismiss = el('button', 'ptc-ghost', T.leadDismiss);
    dismiss.type = 'button';
    dismiss.addEventListener('click', function () {
      card.remove();
    });
    actions.appendChild(submitBtn);
    actions.appendChild(dismiss);

    card.appendChild(email);
    card.appendChild(name);
    card.appendChild(consentWrap);
    card.appendChild(alert);
    card.appendChild(el('p', 'ptc-priv', T.leadPrivacy));
    card.appendChild(actions);

    card.addEventListener('submit', function (event) {
      event.preventDefault();
      alert.style.display = 'none';

      // Client-side checks mirror the server's so the visitor gets an instant,
      // localised message. The server remains the authority.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
        alert.textContent = T.errEmail;
        alert.style.display = 'block';
        return;
      }
      if (!consent.checked) {
        alert.textContent = T.errConsent;
        alert.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = T.leadSending;

      var lastUser = '';
      for (var i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === 'user') {
          lastUser = state.messages[i].content;
          break;
        }
      }

      fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value.trim(),
          name: name.value.trim() || undefined,
          context: lastUser,
          sessionId: state.sessionId,
          pageUrl: window.location.href,
          consent: true
        })
      })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          state.leadSubmitted = true;
          save();
          var ok = el('div', 'ptc-ok' + scriptClass(T.leadSuccess), T.leadSuccess);
          ok.setAttribute('role', 'status');
          card.replaceWith(ok);
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = T.leadSubmit;
          alert.textContent = T.errGeneric;
          alert.style.display = 'block';
        });
    });

    return card;
  }

  /* -------------------------------------------------------------- stream */

  function submit() {
    var text = input.value.trim();
    if (!text || streaming) return;
    input.value = '';
    input.className = 'ptc-input';
    sendBtn.disabled = true;
    send(text);
  }

  function send(text) {
    if (streaming) return;

    var history = state.messages
      .map(function (m) {
        return { role: m.role, content: m.content };
      })
      .concat([{ role: 'user', content: text }]);

    state.messages.push({ role: 'user', content: text });
    state.messages.push({ role: 'assistant', content: '', sources: [] });
    streaming = true;
    render();
    save();

    var assistant = state.messages[state.messages.length - 1];

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        messages: history,
        pageUrl: window.location.href,
        locale: navigator.language
      })
    })
      .then(function (response) {
        if (!response.body) throw new Error('No response body');

        // `stream: true` is essential: a Tamil grapheme spans up to 3 UTF-8
        // bytes and can land across a chunk boundary. Decoding each chunk
        // independently emits replacement characters mid-word.
        var decoder = new TextDecoder('utf-8');
        var reader = response.body.getReader();
        var buffer = '';

        function handleLine(raw) {
          var trimmed = raw.trim();
          if (!trimmed) return;

          var event;
          try {
            event = JSON.parse(trimmed);
          } catch (e) {
            return; // Ignore anything that is not a complete JSON object.
          }

          if (event.type === 'token' && typeof event.value === 'string') {
            assistant.content += event.value;
            render();
          } else if (event.type === 'meta') {
            assistant.sources = event.sources || [];
            assistant.leadCapture = event.leadCapture === true;
          } else if (event.type === 'error') {
            assistant.content = event.value || T.netError;
            assistant.error = true;
          }
        }

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) {
              buffer += decoder.decode();
              if (buffer.trim()) handleLine(buffer);
              return;
            }
            buffer += decoder.decode(result.value, { stream: true });

            // Keep the trailing fragment — it is an incomplete line until the
            // next chunk arrives.
            var lines = buffer.split('\n');
            buffer = lines.pop() || '';
            lines.forEach(handleLine);
            return pump();
          });
        }

        return pump();
      })
      .catch(function () {
        assistant.content = T.netError;
        assistant.error = true;
      })
      .then(function () {
        streaming = false;
        render();
        save();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
