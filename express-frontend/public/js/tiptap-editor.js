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

    // First-paste diagnostic. Logs the incoming clipboard's text/html AND
    // text/plain preview to console ONCE per session so we can see what a
    // paste actually looks like when a user reports alignment isn't sticking.
    // Cheap (fires once), no user-visible effect, no PII risk beyond what's
    // already on the user's own clipboard.
    let firstPasteLogged = false;
    function logFirstPaste(event) {
      if (firstPasteLogged) return;
      firstPasteLogged = true;
      try {
        const cd = event.clipboardData || window.clipboardData;
        const html = (cd && cd.getData && cd.getData('text/html')) || '';
        const plain = (cd && cd.getData && cd.getData('text/plain')) || '';
        console.log('[TipTap paste diagnostic]', {
          hasHtml: !!html,
          htmlPreview: html.slice(0, 400),
          hasPlain: !!plain,
          plainPreview: plain.slice(0, 200),
        });
      } catch (_) { /* diagnostic only, never throw */ }
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
            handlePaste: (view, event) => {
              logFirstPaste(event);
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

