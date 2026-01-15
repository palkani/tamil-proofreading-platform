import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

interface GrammarIssue {
  start: number;
  end: number;
  type: 'spelling' | 'grammar' | 'style';
  message: string;
}

interface GrammarHighlighterStorage {
  issues: GrammarIssue[];
  debounce: NodeJS.Timeout | null;
}

interface GrammarHighlighterState {
  decorations: DecorationSet;
}

const GrammarHighlighterPluginKey = new PluginKey<GrammarHighlighterState>('grammarHighlighter');

// Map plain text offsets to ProseMirror document positions
function mapPlainTextToDoc(doc: any, plainText: string): number[] {
  const mapping: number[] = [];
  let plainIndex = 0;
  let docPos = 1;

  doc.descendants((node: any, pos: number) => {
    if (node.isText) {
      const text = node.text || '';
      for (let i = 0; i < text.length; i++) {
        if (plainIndex < plainText.length) {
          mapping[plainIndex] = docPos + i;
          plainIndex++;
        }
      }
      docPos += text.length;
    } else if (node.isBlock && node.type.name === 'paragraph') {
      // Account for paragraph boundaries (newlines in plain text)
      if (plainIndex < plainText.length && plainText[plainIndex] === '\n') {
        mapping[plainIndex] = docPos;
        plainIndex++;
        docPos++;
      }
    }
    return true;
  });

  // Fill remaining mappings (in case doc is shorter than plainText)
  while (plainIndex < plainText.length) {
    mapping[plainIndex] = docPos;
    plainIndex++;
  }

  return mapping;
}

// TipTap generics are <Options, Storage>
export const GrammarHighlighter = Extension.create<Record<string, never>, GrammarHighlighterStorage>({
  name: 'grammarHighlighter',

  addStorage() {
    return {
      issues: [],
      debounce: null,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin<GrammarHighlighterState>({
        key: GrammarHighlighterPluginKey,
        state: {
          init() {
            return { decorations: DecorationSet.empty };
          },
          apply(tr, value, oldState, newState) {
            // Check if this transaction has new decorations
            const meta = tr.getMeta(GrammarHighlighterPluginKey);
            if (meta) {
              return meta as GrammarHighlighterState;
            }
            // Map decorations through transaction
            const mapped = value.decorations.map(tr.mapping, tr.doc);
            return { decorations: mapped };
          },
        },
        props: {
          decorations(state) {
            const pluginState = GrammarHighlighterPluginKey.getState(state);
            return pluginState?.decorations || DecorationSet.empty;
          },
        },
        view(editorView) {
          // Helper to update decorations from storage
          const updateDecos = () => {
            const storage = extension.storage as GrammarHighlighterStorage;
            const state = editorView.state;
            const plainText = state.doc.textBetween(0, state.doc.content.size, '\n', '\n');
            const offsetMap = mapPlainTextToDoc(state.doc, plainText);

            const decos: Decoration[] = [];

            storage.issues.forEach(issue => {
              const from = offsetMap[issue.start] ?? issue.start;
              const to = offsetMap[issue.end] ?? issue.end;

              if (from >= 0 && to > from && to <= state.doc.content.size) {
                const className =
                  issue.type === 'spelling'
                    ? 'grammar-highlight grammar-spelling'
                    : issue.type === 'grammar'
                    ? 'grammar-highlight grammar-grammar'
                    : 'grammar-highlight grammar-style';

                const deco = Decoration.inline(from, to, {
                  class: className,
                  'data-message': issue.message,
                  title: issue.message,
                });
                decos.push(deco);
              }
            });

            const decoSet = DecorationSet.create(state.doc, decos);

            // Update plugin state via transaction
            const tr = state.tr.setMeta(GrammarHighlighterPluginKey, { decorations: decoSet });
            editorView.dispatch(tr);
          };

          // Expose update function to extension
          (extension as any)._updateGrammarDecorations = updateDecos;

          return {
            update() {
              // Decorations will be updated via updateDecos() call
            },
            destroy() {
              delete (extension as any)._updateGrammarDecorations;
            },
          };
        },
      }),
    ];
  },

  onUpdate({ editor }) {
    const storage = this.storage as GrammarHighlighterStorage;

    // Clear previous debounce
    if (storage.debounce) {
      clearTimeout(storage.debounce);
    }

    // Debounced grammar check (900ms after typing stops)
    storage.debounce = setTimeout(async () => {
      try {
        const plainText = editor.state.doc.textBetween(
          0,
          editor.state.doc.content.size,
          '\n',
          '\n'
        );

        // Skip if text is too short
        if (plainText.trim().length < 10) {
          storage.issues = [];
          const updateFn = (this as any)._updateGrammarDecorations;
          if (updateFn) updateFn();
          return;
        }

        const res = await fetch(
          `/api/grammar/check?text=${encodeURIComponent(plainText)}`
        );

        if (!res.ok) {
          storage.issues = [];
          const updateFn = (this as any)._updateGrammarDecorations;
          if (updateFn) updateFn();
          return;
        }

        const data = await res.json();
        storage.issues = data.issues || [];
        const updateFn = (this as any)._updateGrammarDecorations;
        if (updateFn) updateFn();
      } catch (err) {
        console.error('[GrammarHighlighter] Check error:', err);
        storage.issues = [];
        const updateFn = (this as any)._updateGrammarDecorations;
        if (updateFn) updateFn();
      }
    }, 900);
  },
});

