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
          ],
          content: initialContent || '<p></p>',
          editorProps: {
            attributes: {
              class: 'ProseMirror prose prose-sm max-w-none focus:outline-none',
              'data-placeholder': 'தமிழில் எழுதத் தொடங்குங்கள்...',
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

