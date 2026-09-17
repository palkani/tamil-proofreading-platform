/**
 * TipTap Editor Bootstrap
 * 
 * This file provides a vanilla JS wrapper for TipTap editor.
 * It loads TipTap from CDN and exposes a simple API.
 * 
 * Migration Phase 2: Add TipTap bootstrap file
 */

// Global flag to track if TipTap is loaded
window.TIPTAP_LOADED = false;
window.createTipTapEditor = null;

// Load TipTap from CDN and initialize
(async function loadTipTap() {
  if (window.TIPTAP_LOADED) {
    return;
  }

  try {
    // Use unpkg CDN for TipTap
    // Import TipTap core and StarterKit
    const { Editor, Extension } = await import('https://esm.sh/@tiptap/core@2.1.13');
    const { default: StarterKit } = await import('https://esm.sh/@tiptap/starter-kit@2.1.13');
    const { default: Underline } = await import('https://esm.sh/@tiptap/extension-underline@2.1.13');
    const { default: Link } = await import('https://esm.sh/@tiptap/extension-link@2.1.13');
    const { default: TextAlign } = await import('https://esm.sh/@tiptap/extension-text-align@2.1.13');
    // ProseMirror primitives for the ProofreadPlugin — TipTap re-exports
    // them under @tiptap/pm so we don't need to pin ProseMirror versions
    // separately. Decoration-based highlighting replaces the DOM-span
    // wrapping in workspace.js (which was targeting the hidden legacy
    // #editor when USE_TIPTAP_EDITOR was on — no highlights ever showed
    // for TipTap users). See TipTap migration plan §04 Phase 1.
    const { Plugin, PluginKey } = await import('https://esm.sh/@tiptap/pm@2.1.13/state');
    const { Decoration, DecorationSet } = await import('https://esm.sh/@tiptap/pm@2.1.13/view');

    // TipTap's stock TextAlign.parseHTML only reads element.style.textAlign,
    // which catches inline styles from ourselves and from Google Docs but
    // MISSES the shapes Word actually uses on paste:
    //   1. <p align="center">…</p>              (Office legacy attribute)
    //   2. <p class="MsoCenterAlign">…</p>       (Word 2016+ hoists alignment
    //      into a stripped-out <style> block referenced by class)
    // Result: user pastes a formatted Word doc, alignment is lost even though
    // the extension is loaded. Reported 2026-09-15 with a real Word paste.
    //
    // Extending the extension to check all three sources (inline style, align
    // attribute, MsoCenter/Right/Justify class prefix) so Word/Docs/manual
    // HTML all round-trip. Uses the extension's own `alignments` option so
    // arbitrary/nonstandard values still fall back to the default.
    const AlignmentAware = TextAlign.extend({
      addGlobalAttributes() {
        const alignments = this.options.alignments || ['left', 'center', 'right', 'justify'];
        const defaultAlignment = this.options.defaultAlignment || 'left';
        const isValid = (v) => v && alignments.indexOf(v) !== -1;
        return [
          {
            types: this.options.types,
            attributes: {
              textAlign: {
                default: defaultAlignment,
                parseHTML(element) {
                  // 1. inline style — covers TipTap self-emit and modern Google Docs
                  const style = element.style && String(element.style.textAlign || '').toLowerCase();
                  if (isValid(style)) return style;
                  // 2. legacy align attribute — Word/older HTML editors
                  const attr = element.getAttribute && element.getAttribute('align');
                  if (attr) {
                    const v = String(attr).toLowerCase();
                    if (isValid(v)) return v;
                  }
                  // 3. Word MSO class hints — class="MsoCenterAlign" etc.
                  const cls = String(element.className || '');
                  if (/\bMsoCenter/i.test(cls) && isValid('center'))   return 'center';
                  if (/\bMsoRight/i.test(cls)  && isValid('right'))    return 'right';
                  if (/\bMsoJustify/i.test(cls) && isValid('justify')) return 'justify';
                  return defaultAlignment;
                },
                renderHTML(attributes) {
                  if (!attributes || attributes.textAlign === defaultAlignment) return {};
                  return { style: `text-align: ${attributes.textAlign}` };
                },
              },
            },
          },
        ];
      },
    });

    // ── ProofreadPlugin ─────────────────────────────────────────
    //
    // The Phase 1 core of the TipTap migration plan
    // (https://claude.ai/artifact/6h22Ya3ykUorhBAt9Uiziz §04 P1).
    //
    // BEFORE: workspace.js._highlightCorrectionsInEditor wrapped every
    // occurrence of each correction's sourceText with a <span
    // class="correction-highlight X"> using range.surroundContents on
    // document.getElementById('editor'). For USE_TIPTAP_EDITOR=true
    // users, that #editor node is HIDDEN — spans went into a div
    // nobody looked at, so highlights never appeared. On top of that,
    // every edit inside a span splits its text nodes and drifts the
    // wrap; positions became unreliable.
    //
    // AFTER: this plugin holds a ProseMirror DecorationSet as plugin
    // state. On every transaction, decorations map through tr.mapping
    // automatically — positions update as the user types, no manual
    // reconciliation. Rendering is Decoration.inline(from, to, {class:
    // 'correction-highlight …'}), which the browser paints without
    // mutating the doc tree.
    //
    // The external API is window.tiptapProofreadPlugin.setCorrections /
    // clear. workspace.js's existing correction pipeline calls these on
    // the TipTap path and keeps its DOM-span code path for legacy.
    //
    // Matching is still text-based (indexOf per sourceText) for Phase 1.
    // Phase 2 will replace it with per-block hashed offsets returned by
    // a new API — but that's a backend contract change; this PR ships
    // the client infrastructure that Phase 2 will plug into.
    const proofreadPluginKey = new PluginKey('prooftamilProofread');

    // Map a suggestion.type string to the CSS class the workspace uses
    // today. Kept in sync with workspace.js _getCorrectionTypeClass so
    // both editors render squiggles with identical styling.
    function proofreadTypeClass(type) {
      const t = String(type || 'grammar').toLowerCase().replace(/\s+/g, '-');
      const map = {
        grammar:     'correction-grammar',
        punctuation: 'correction-punctuation',
        spelling:    'correction-spelling',
        style:       'correction-style',
        clarity:     'correction-style',
        rewrite:     'correction-style',
      };
      return map[t] || 'correction-grammar';
    }

    function escapeAttr(s) {
      return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    // Walk the doc's text nodes, for each correction's sourceText emit
    // Decoration.inline at every occurrence. Skips overlaps (first-win)
    // and matches < 2 chars — matches workspace.js's current filtering
    // so behavior stays consistent.
    function buildProofreadDecorations(doc, corrections) {
      if (!doc || !corrections || corrections.length === 0) {
        return DecorationSet.empty;
      }
      const decos = [];
      const seenRanges = [];  // list of {from, to} already claimed
      const overlaps = (from, to) => {
        for (const r of seenRanges) {
          if (from < r.to && to > r.from) return true;
        }
        return false;
      };

      doc.descendants((node, pos) => {
        if (!node.isText) return true;
        const text = node.text || '';
        for (const c of corrections) {
          const searchText = String((c && (c.sourceText || c.originalText)) || '').trim();
          if (searchText.length < 2) continue;
          let idx = text.indexOf(searchText);
          while (idx !== -1) {
            const from = pos + idx;
            const to = from + searchText.length;
            if (!overlaps(from, to)) {
              seenRanges.push({ from, to });
              decos.push(Decoration.inline(from, to, {
                class: 'correction-highlight ' + proofreadTypeClass(c.type),
                'data-suggestion-id': String(c.id || ''),
                'data-title':         escapeAttr(c.title || c.reason || ''),
                'data-description':   escapeAttr(c.description || c.reason || ''),
              }));
            }
            idx = text.indexOf(searchText, idx + searchText.length);
          }
        }
        return true;   // descend into children
      });

      return DecorationSet.create(doc, decos);
    }

    const ProofreadExtension = Extension.create({
      name: 'proofread',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: proofreadPluginKey,
            state: {
              init() {
                return { decorations: DecorationSet.empty };
              },
              apply(tr, prev, _oldState, newState) {
                // 1. Auto-map existing decorations through this transaction.
                //    This is what gives us position stability — no manual
                //    "re-find sourceText after edit" logic needed.
                let decorations = prev.decorations.map(tr.mapping, tr.doc);

                // 2. Meta actions from the outside (workspace.js's
                //    correction pipeline) can replace the whole set.
                const meta = tr.getMeta(proofreadPluginKey);
                if (meta) {
                  if (meta.type === 'setAll') {
                    decorations = buildProofreadDecorations(newState.doc, meta.corrections || []);
                  } else if (meta.type === 'clear') {
                    decorations = DecorationSet.empty;
                  }
                }

                return { decorations };
              },
            },
            props: {
              decorations(state) {
                return this.getState(state).decorations;
              },
              // Click on a squiggle bubbles a custom event with the
              // suggestion metadata + the rect of the clicked span so
              // workspace.js can position its popover. Keeps the popover
              // implementation exactly where it is today; only the click
              // detection moves.
              handleClickOn(view, pos, node, nodePos, event, direct) {
                const target = event && event.target;
                if (!target || !target.classList || !target.classList.contains('correction-highlight')) {
                  return false;
                }
                try {
                  const detail = {
                    suggestionId: target.getAttribute('data-suggestion-id') || '',
                    title:        target.getAttribute('data-title') || '',
                    description:  target.getAttribute('data-description') || '',
                    rect:         target.getBoundingClientRect(),
                  };
                  window.dispatchEvent(new CustomEvent('tiptap:correction-click', { detail }));
                } catch (_e) { /* diagnostic only */ }
                return true;
              },
            },
          }),
        ];
      },
    });

    // External control surface for workspace.js — the existing correction
    // pipeline calls these on the TipTap path (see workspace.js
    // _highlightCorrectionsInEditor / _clearCorrectionHighlights).
    // Deliberately does NOT hold a direct editor reference — grabs the
    // current one from window.tiptapWorkspaceEditor at call time (which
    // downstream consumers of the migration inventory all use).
    function _getCurrentTipTap() {
      const g = window.tiptapWorkspaceEditor;
      return typeof g === 'function' ? g() : g;
    }
    window.tiptapProofreadPlugin = {
      setCorrections(suggestions) {
        const ed = _getCurrentTipTap();
        if (!ed || !ed.view || !ed.state) return false;
        try {
          const tr = ed.state.tr.setMeta(proofreadPluginKey, {
            type: 'setAll',
            corrections: Array.isArray(suggestions) ? suggestions : [],
          });
          ed.view.dispatch(tr);
          return true;
        } catch (e) {
          console.warn('[Proofread] setCorrections failed:', e && e.message);
          return false;
        }
      },
      clear() {
        const ed = _getCurrentTipTap();
        if (!ed || !ed.view || !ed.state) return false;
        try {
          const tr = ed.state.tr.setMeta(proofreadPluginKey, { type: 'clear' });
          ed.view.dispatch(tr);
          return true;
        } catch (e) {
          console.warn('[Proofread] clear failed:', e && e.message);
          return false;
        }
      },
    };

    // Paste diagnostic. Logs the incoming clipboard's text/html AND
    // text/plain to console on EVERY paste, plus what TipTap actually
    // kept after its own parse cycle. Comparing the two exposes:
    //   1. Word/Docs shapes we don't yet parse (raw has text-align in
    //      some form we miss → editor lands without it)
    //   2. Sanitisation drops (schema doesn't include the attribute → we
    //      strip it; adding it to the schema is the fix)
    //   3. Wrapper elements that reflow the alignment onto a non-block
    //      node (span with text-align — CSS-invalid but Word emits it)
    //
    // First fires immediately on paste (raw clipboard). A `setTimeout(0)`
    // logs the editor state right after TipTap finishes its parse, so
    // the two log lines land in the console next to each other with the
    // same [TipTap paste diagnostic #N] tag. Fires on every paste (not
    // just the first — an earlier version limited to first only, which
    // made debugging impossible when user reported a paste that had
    // happened after opening DevTools).
    let pasteSeq = 0;
    function logPasteDiagnostic(event) {
      pasteSeq += 1;
      const seq = pasteSeq;
      try {
        const cd = event.clipboardData || window.clipboardData;
        const html  = (cd && cd.getData && cd.getData('text/html'))  || '';
        const plain = (cd && cd.getData && cd.getData('text/plain')) || '';
        // Report ALL styles/attrs the first few <p> tags carry so we
        // can eyeball which alignment source Word used this time.
        const paragraphSummaries = [];
        try {
          const paraRegex = /<(p|h[1-6])\b([^>]*)>/gi;
          let m; let n = 0;
          while ((m = paraRegex.exec(html)) !== null && n < 5) {
            paragraphSummaries.push({ tag: m[1], attrs: m[2].trim().slice(0, 240) });
            n += 1;
          }
        } catch (_) { /* diagnostic only */ }
        console.log('[TipTap paste diagnostic #' + seq + ' RAW]', {
          hasHtml: !!html,
          htmlBytes: html.length,
          htmlPreview: html.slice(0, 1000),
          firstFewParagraphOpeners: paragraphSummaries,
          hasPlain: !!plain,
          plainPreview: plain.slice(0, 300),
        });
      } catch (_) { /* diagnostic only, never throw */ }

      // After TipTap's own paste parse pipeline runs, capture what the
      // schema kept. If alignment/bold/italic shows up here it survived;
      // if it's missing but WAS in the raw clipboard, TipTap dropped it
      // → tells us to extend parseHTML further. window.tiptapWorkspaceEditor
      // is a FUNCTION accessor (see workspace.js line ~7562) — must call
      // it to reach the actual editor instance. Previous version referenced
      // the function directly and silently no-op'd for months.
      setTimeout(function () {
        try {
          const accessor = window.tiptapWorkspaceEditor;
          const editor = typeof accessor === 'function' ? accessor() : accessor;
          if (editor && typeof editor.getHTML === 'function') {
            const kept = editor.getHTML();
            console.log('[TipTap paste diagnostic #' + seq + ' KEPT]', {
              editorHtmlBytes: kept.length,
              editorHtmlPreview: kept.slice(0, 1000),
            });
          }
        } catch (_) { /* diagnostic only */ }
      }, 0);
    }

    // ── Legacy Tamil encoding detection ────────────────────────────
    //
    // Reported by a customer 2026-09-15 — pasted Tamil looked correct
    // in Word but rendered as junk in ProofTamil. Cause: source document
    // used a non-Unicode Tamil font (Bamini, TAB, TAM, TSCII) where each
    // byte position maps to a Tamil glyph but the underlying character
    // codes are Latin. When copy-pasted into any Unicode-expecting app
    // the bytes re-render as different characters — Tamil-shaped but
    // meaningless.
    //
    // We can't auto-convert (that needs per-font byte-map tables which
    // are out of scope for this PR). But we CAN detect the pattern and
    // give the user a one-time non-blocking warning telling them to
    // convert to Unicode first. Same info the customer got from support
    // earlier — surfaced automatically.
    //
    // Detection signal (any one triggers):
    //   1. text/html font-family names any legacy Tamil font
    //   2. text/plain is > 30% Latin AND text/rtf mentions those fonts
    //   3. text/plain looks like Bamini byte-pattern (high frequency of
    //      specific Latin chars that render as Tamil glyphs — heuristic)
    //
    // Fires at most once per session (`legacyEncodingWarned`). No
    // preventDefault — the paste still lands; the user just gets a
    // toast advising them what to do.
    const LEGACY_TAMIL_FONTS = [
      'Bamini', 'TAB', 'TAM', 'TSC', 'TSCII', 'Elango', 'Mylai',
      'Amuthu', 'Kanchi', 'Tamil TAM', 'Barani', 'Thendral', 'Roman',
      'ShreeLipi', 'ShreeTam', 'Adhawin', 'AvarangalAM',
    ];
    let legacyEncodingWarned = false;
    function detectLegacyTamilEncoding(event) {
      if (legacyEncodingWarned) return;
      let signal = null;
      try {
        const cd = event.clipboardData || window.clipboardData;
        const html  = (cd && cd.getData && cd.getData('text/html'))  || '';
        const rtf   = (cd && cd.getData && cd.getData('text/rtf'))   || '';
        const plain = (cd && cd.getData && cd.getData('text/plain')) || '';

        // Signal 1 + 2 — font-family or RTF font-table mentions a known
        // legacy Tamil font. Case-insensitive.
        const clip = (html + ' ' + rtf).toLowerCase();
        for (const font of LEGACY_TAMIL_FONTS) {
          if (clip.indexOf(font.toLowerCase()) !== -1) {
            signal = { font, source: html ? 'html' : 'rtf' };
            break;
          }
        }

        // Signal 3 — plain-text byte pattern. Bamini-encoded Tamil has
        // near-zero Tamil Unicode chars AND a very high density of Latin
        // letters + punctuation. If plain text is "mostly Latin" AND
        // "has no Tamil Unicode range chars" AND "is long enough that
        // we're confident it's a paragraph not a URL", flag it. This is
        // heuristic — avoids false positives on English pastes.
        if (!signal && plain && plain.length > 60) {
          const tamilChars = (plain.match(/[஀-௿]/g) || []).length;
          const latinChars = (plain.match(/[A-Za-z]/g) || []).length;
          if (tamilChars === 0 && latinChars / plain.length > 0.4) {
            // Additional: if the html paste has non-Latin fonts specified
            // (font-family:) we're much more confident.
            if (/font-family\s*:/i.test(html)) {
              signal = { font: 'unknown-legacy', source: 'heuristic' };
            }
          }
        }
      } catch (_e) { /* diagnostic only, never throw from a paste handler */ }

      if (!signal) return;
      legacyEncodingWarned = true;
      console.warn('[TipTap paste] Detected likely legacy Tamil font paste:', signal);
      // Non-blocking toast — user can dismiss and continue. Auto-hides
      // after 25s so it doesn't linger.
      showLegacyEncodingToast(signal);
    }

    function showLegacyEncodingToast(signal) {
      try {
        if (document.getElementById('pt-legacy-encoding-toast')) return;
        const t = document.createElement('div');
        t.id = 'pt-legacy-encoding-toast';
        t.setAttribute('role', 'alert');
        t.style.cssText = [
          'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
          'max-width:420px', 'background:#FFFBEB', 'border:1px solid #F59E0B',
          'border-radius:8px', 'padding:14px 40px 14px 16px',
          'box-shadow:0 8px 24px rgba(0,0,0,0.12)',
          'font-family:ui-sans-serif,system-ui,-apple-system,sans-serif',
          'font-size:13.5px', 'color:#78350F', 'line-height:1.5',
        ].join(';');
        t.innerHTML =
          '<button aria-label="Dismiss" style="position:absolute;top:6px;right:8px;background:none;border:none;font-size:20px;line-height:1;color:#92400E;cursor:pointer;padding:2px 6px">&times;</button>' +
          '<div style="font-weight:600;margin-bottom:4px">Non-Unicode Tamil font detected</div>' +
          '<div>Your paste looks like it\'s from a legacy Tamil font' +
          (signal.font && signal.font !== 'unknown-legacy' ? ' (<b>' + escapeAttr(signal.font) + '</b>)' : '') +
          '. Modern editors can\'t read those bytes as Tamil — words will look wrong or garbled.</div>' +
          '<div style="margin-top:8px">Convert first: <a href="https://www.tamilcube.com/utility/unicode-converter.aspx" target="_blank" rel="noopener" style="color:#1D4ED8;text-decoration:underline">tamilcube unicode converter</a></div>';
        t.querySelector('button').addEventListener('click', function () {
          if (t.parentNode) t.parentNode.removeChild(t);
        });
        document.body.appendChild(t);
        setTimeout(function () {
          if (t.parentNode) t.parentNode.removeChild(t);
        }, 25000);
      } catch (_e) { /* toast is best-effort */ }
    }

    // ── Word-paste HTML normalizer ────────────────────────────────
    //
    // Word puts alignment in half a dozen places (align="" attribute,
    // MsoCenter/Right/Justify class, mso-* CSS blocks, `<div align=...>`
    // wrappers). TipTap's AlignmentAware.parseHTML I ship above reads
    // element.style.textAlign / align / MsoClass — but only on the
    // <p>/<h1-6> node itself. If Word wraps the alignment on a WRAPPING
    // element (`<div align="center"><p>...</p></div>`) it never reaches
    // paragraph-level parseHTML.
    //
    // Fix: normalize the HTML BEFORE it reaches ProseMirror's schema
    // parser. Convert every alignment source to the canonical inline
    // style form, so by the time TipTap sees a <p>, its style already
    // says text-align:X. This is the same approach TipTap-based
    // competitor editors use for Word paste — it's the only way to
    // handle Word's zoo of alignment mechanisms uniformly.
    function normalizeWordPasteHtml(html) {
      if (typeof html !== 'string' || !html) return html;

      // 1. Strip Word's XML/mso boilerplate that adds no signal.
      // Keeps the <html>/<body> content — those get unwrapped by
      // ProseMirror anyway.
      html = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\?xml[^>]*>/gi, '')
        .replace(/<meta[^>]*>/gi, '')
        .replace(/<link[^>]*>/gi, '')
        .replace(/xmlns[^=]*="[^"]*"/gi, '')
        .replace(/mso-[\w-]+\s*:\s*[^;"]+;?/gi, '');

      // 2. Fold <p align="X"> / <h1-6 align="X"> / <div align="X"> into
      // inline style="text-align:X". Handles both quoted and unquoted
      // attribute values.
      html = html.replace(
        /<(p|h[1-6]|div)\b([^>]*)\salign\s*=\s*["']?(left|center|right|justify)["']?([^>]*)>/gi,
        function (_m, tag, before, align, after) {
          const alignLc = align.toLowerCase();
          const rest = (before + after).replace(/\s+align\s*=\s*["']?\w+["']?/gi, '');
          const styleMatch = rest.match(/style\s*=\s*["']([^"']*)["']/i);
          if (styleMatch) {
            if (/text-align\s*:/i.test(styleMatch[1])) {
              return '<' + tag + rest + '>';
            }
            const newStyle = (styleMatch[1].replace(/;\s*$/, '') + '; text-align: ' + alignLc).replace(/^;\s*/, '');
            return '<' + tag + rest.replace(/style\s*=\s*["'][^"']*["']/i, 'style="' + newStyle + '"') + '>';
          }
          return '<' + tag + rest + ' style="text-align: ' + alignLc + '">';
        }
      );

      // 3. Fold Mso class-based alignment (Word 2016+) into inline style.
      html = html.replace(
        /<(p|h[1-6]|div)\b([^>]*)>/gi,
        function (match, tag, attrs) {
          const clsMatch = attrs.match(/class\s*=\s*["']([^"']*)["']/i);
          if (!clsMatch) return match;
          const cls = clsMatch[1];
          let align = null;
          if (/\bMsoCenter/i.test(cls)) align = 'center';
          else if (/\bMsoRight/i.test(cls)) align = 'right';
          else if (/\bMsoJustify/i.test(cls)) align = 'justify';
          if (!align) return match;
          const styleMatch = attrs.match(/style\s*=\s*["']([^"']*)["']/i);
          if (styleMatch) {
            if (/text-align\s*:/i.test(styleMatch[1])) return match;
            const newStyle = (styleMatch[1].replace(/;\s*$/, '') + '; text-align: ' + align).replace(/^;\s*/, '');
            return '<' + tag + attrs.replace(/style\s*=\s*["'][^"']*["']/i, 'style="' + newStyle + '"') + '>';
          }
          return '<' + tag + attrs + ' style="text-align: ' + align + '">';
        }
      );

      // 4. Push alignment from wrapper <div style="text-align:X"> down
      // onto the child <p>. If a <div style="text-align:center">
      // wraps <p>Foo</p>, the <p> has no alignment attribute of its
      // own — Word/browsers rely on CSS inheritance, which TipTap
      // doesn't respect (each node stores its own attributes).
      html = html.replace(
        /<div\b([^>]*style\s*=\s*["'][^"']*text-align\s*:\s*(left|center|right|justify)[^"']*["'][^>]*)>([\s\S]*?)<\/div>/gi,
        function (_m, divAttrs, align, inner) {
          const alignLc = align.toLowerCase();
          // Only push down to <p>/<h1-6> that don't already have their own alignment
          const innerRewritten = inner.replace(
            /<(p|h[1-6])\b([^>]*)>/gi,
            function (m2, tag, attrs) {
              const styleMatch = attrs.match(/style\s*=\s*["']([^"']*)["']/i);
              if (styleMatch && /text-align\s*:/i.test(styleMatch[1])) return m2;
              if (styleMatch) {
                const newStyle = (styleMatch[1].replace(/;\s*$/, '') + '; text-align: ' + alignLc).replace(/^;\s*/, '');
                return '<' + tag + attrs.replace(/style\s*=\s*["'][^"']*["']/i, 'style="' + newStyle + '"') + '>';
              }
              return '<' + tag + attrs + ' style="text-align: ' + alignLc + '">';
            }
          );
          return '<div' + divAttrs + '>' + innerRewritten + '</div>';
        }
      );

      // 5. Word wraps bold/italic in <span class="MsoBold">…</span> or
      // <span style="font-weight:bold">…</span>, and TipTap's Bold mark
      // only recognises <strong>/<b>/inline font-weight:bold on the
      // element itself — not classes referring to a Word style block
      // TipTap never parsed. Rewrite these spans to <strong>/<em> so
      // TipTap's default parseHTML picks them up.
      html = html.replace(
        /<span\b([^>]*)>([\s\S]*?)<\/span>/gi,
        function (m, attrs, inner) {
          const clsMatch = attrs.match(/class\s*=\s*["']([^"']*)["']/i);
          const styleMatch = attrs.match(/style\s*=\s*["']([^"']*)["']/i);
          const cls = clsMatch ? clsMatch[1] : '';
          const style = styleMatch ? styleMatch[1] : '';
          const isBold =
            /\bMsoBold\b/i.test(cls) ||
            /\bMsoStrong\b/i.test(cls) ||
            /font-weight\s*:\s*(bold|[6-9]\d{2}|1000)/i.test(style);
          const isItalic =
            /\bMsoItalic\b/i.test(cls) ||
            /\bMsoEmphasis\b/i.test(cls) ||
            /font-style\s*:\s*italic/i.test(style);
          const isUnderline =
            /\bMsoUnderline\b/i.test(cls) ||
            /text-decoration[^;"']*:\s*[^;"']*underline/i.test(style);
          if (!isBold && !isItalic && !isUnderline) return m;
          let out = inner;
          if (isUnderline) out = '<u>' + out + '</u>';
          if (isItalic)   out = '<em>' + out + '</em>';
          if (isBold)     out = '<strong>' + out + '</strong>';
          return out;
        }
      );

      // 6. Word Title / Heading styles: <p class="MsoTitle"> → <h1>,
      // <p class="MsoHeading1/2/3"> → <h1/2/3>. TipTap loads Heading
      // levels 1-3 via StarterKit; deeper ones would just fall through.
      // Preserves any inline style (typically text-align from step 4)
      // by pulling it across to the new heading tag.
      html = html.replace(
        /<p\b([^>]*)>([\s\S]*?)<\/p>/gi,
        function (m, attrs, inner) {
          const clsMatch = attrs.match(/class\s*=\s*["']([^"']*)["']/i);
          if (!clsMatch) return m;
          const cls = clsMatch[1];
          let level = 0;
          if (/\bMsoTitle\b/i.test(cls))          level = 1;
          else if (/\bMsoHeading\s*1\b/i.test(cls)) level = 1;
          else if (/\bMsoHeading\s*2\b/i.test(cls)) level = 2;
          else if (/\bMsoHeading\s*3\b/i.test(cls)) level = 3;
          if (!level) return m;
          // Keep only style attribute (drop the class since we're
          // remapping the tag); style may carry text-align from step 4.
          const styleMatch = attrs.match(/style\s*=\s*["'][^"']*["']/i);
          const carry = styleMatch ? ' ' + styleMatch[0] : '';
          return '<h' + level + carry + '>' + inner + '</h' + level + '>';
        }
      );

      return html;
    }

    // Expose editor creation function globally
    window.createTipTapEditor = function (element, initialContent = '') {
      if (!element) {
        console.error('[TipTap] Element is required');
        return null;
      }

      try {
        const editor = new Editor({
          element: element,
          extensions: [
            StarterKit.configure({
              // Configure extensions as needed
              heading: {
                levels: [1, 2, 3],
              },
            }),
            Underline,
            Link.configure({
              openOnClick: false,
              autolink: true,
              linkOnPaste: true,
            }),
            AlignmentAware.configure({
              types: ['heading', 'paragraph'],
            }),
            // Decoration-based correction highlighting. Replaces the DOM
            // span-wrap path in workspace.js for TipTap users. See the
            // ProofreadPlugin block above for the full rationale.
            ProofreadExtension,
          ],
          content: initialContent || '<p></p>',
          editorProps: {
            attributes: {
              class: 'ProseMirror prose prose-sm max-w-none focus:outline-none',
              'data-placeholder': 'தமிழில் எழுதத் தொடங்குங்கள்...',
            },
            // Runs BEFORE ProseMirror parses the pasted HTML through the
            // schema. Our chance to normalize Word/Docs alignment sources
            // into the one shape TipTap's AlignmentAware.parseHTML reads:
            // inline style="text-align:X" on the paragraph itself.
            transformPastedHTML(html) {
              try {
                const normalized = normalizeWordPasteHtml(html);
                if (normalized !== html) {
                  console.log('[TipTap paste normalize] rewrote HTML', {
                    beforeBytes: html.length,
                    afterBytes: normalized.length,
                    beforePreview: html.slice(0, 400),
                    afterPreview: normalized.slice(0, 400),
                  });
                }
                return normalized;
              } catch (e) {
                console.warn('[TipTap paste normalize] failed, returning original:', e && e.message);
                return html;
              }
            },
            handlePaste: (view, event) => {
              logPasteDiagnostic(event);
              detectLegacyTamilEncoding(event);
              try {
                const text =
                  (event.clipboardData && event.clipboardData.getData('text/plain')) ||
                  (window.clipboardData && window.clipboardData.getData('Text')) ||
                  '';
                window.dispatchEvent(
                  new CustomEvent('tiptap:paste', {
                    detail: { text },
                  })
                );
              } catch (e) {
                // non-fatal
              }

              // Empty-doc paste path. When the target is an empty
              // single-paragraph doc (state after Ctrl+A → Delete →
              // paste), ProseMirror's default clipboard parser inlines
              // the first pasted paragraph into that empty target and
              // drops its block-level attributes (text-align is the
              // classic loss). Reroute through setContent so the source
              // block structure survives verbatim.
              try {
                const doc = view.state.doc;
                const isEmptyDoc =
                  doc.textContent === '' &&
                  doc.childCount === 1 &&
                  (doc.firstChild.type.name === 'paragraph' || doc.firstChild.type.name === 'heading');
                if (isEmptyDoc && event.clipboardData) {
                  const html = event.clipboardData.getData('text/html') || '';
                  if (html && html.trim()) {
                    const normalized = normalizeWordPasteHtml(html);
                    const accessor = window.tiptapWorkspaceEditor;
                    const editor = typeof accessor === 'function' ? accessor() : accessor;
                    if (editor && editor.commands && typeof editor.commands.setContent === 'function') {
                      event.preventDefault();
                      editor.commands.setContent(normalized, true);
                      console.log('[TipTap] Empty-doc paste rerouted through setContent (preserves first-paragraph attrs)');
                      // Belt-and-suspenders: the tiptap:paste event above
                      // triggers queuePasteAnalyze, which schedules a 300ms
                      // pasteAnalyzeTimeout → autosave → autoAnalyze. But
                      // since setContent bypasses the DOM InputEvent flow,
                      // some older paste-listeners never fire and the
                      // pipeline can go quiet. Re-queue explicitly here so
                      // "paste + AI suggestions" always fires as expected.
                      setTimeout(function () {
                        try {
                          const wc = window.workspaceController;
                          if (wc && typeof wc.queuePasteAnalyze === 'function') {
                            wc.queuePasteAnalyze('empty-doc-fast-path');
                          }
                        } catch (_) { /* non-fatal */ }
                      }, 30);
                      return true;
                    }
                  }
                }
              } catch (err) {
                console.warn('[TipTap] Empty-doc paste fast-path failed, falling back to default paste:', err && err.message);
              }

              return false; // allow TipTap to handle paste normally
            },
          },
          onUpdate: ({ editor }) => {
            // Trigger custom event for integration with legacy code
            const event = new CustomEvent('tiptap:update', {
              detail: {
                text: editor.getText(),
                html: editor.getHTML(),
                json: editor.getJSON(),
              },
            });
            window.dispatchEvent(event);
          },
          onCreate: ({ editor }) => {
            console.log('[TipTap] Editor created');
          },
        });

        return editor;
      } catch (error) {
        console.error('[TipTap] Error creating editor:', error);
        return null;
      }
    };

    // Expose the paste normalizer globally so the home-page editor
    // (contenteditable + execCommand, not TipTap) can share the same
    // Word Mso class → standard-tag rewriting instead of duplicating it.
    window.normalizeWordPasteHtml = normalizeWordPasteHtml;

    window.TIPTAP_LOADED = true;
    console.log('[TipTap] Bootstrap loaded successfully');

    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('tiptap:ready'));
  } catch (error) {
    console.error('[TipTap] Failed to load from CDN:', error);
    // Fallback: provide a stub function that does nothing
    window.createTipTapEditor = function () {
      console.warn('[TipTap] Editor creation failed - TipTap not loaded');
      return null;
    };
  }
})();

