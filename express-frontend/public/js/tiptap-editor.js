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
    const { Editor } = await import('https://esm.sh/@tiptap/core@2.1.13');
    const { default: StarterKit } = await import('https://esm.sh/@tiptap/starter-kit@2.1.13');
    const { default: Underline } = await import('https://esm.sh/@tiptap/extension-underline@2.1.13');
    const { default: Link } = await import('https://esm.sh/@tiptap/extension-link@2.1.13');
    const { default: TextAlign } = await import('https://esm.sh/@tiptap/extension-text-align@2.1.13');

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
      // schema kept. If alignment shows up here it succeeded; if it's
      // missing here but WAS in the raw clipboard, TipTap dropped it →
      // that tells us to extend the parseHTML.
      setTimeout(function () {
        try {
          const editor = window.tiptapWorkspaceEditor;
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

