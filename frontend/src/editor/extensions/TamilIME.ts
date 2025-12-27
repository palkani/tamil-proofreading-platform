import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

interface TamilIMEStorage {
  token: string | null;
  start: number | null;
  end: number | null;
  candidates: Array<{ text: string; score?: number }>;
  index: number;
  ghost: string | null;
  debounce: NodeJS.Timeout | null;
}

interface TamilIMEState {
  decorations: DecorationSet;
}

// Token extraction helper (caret-aware)
function getTokenAtCaret(state: any) {
  const { from } = state.selection;
  const docText = state.doc.textBetween(0, state.doc.content.size, '\n', '\n');

  let start = from - 1;
  while (start > 0 && /\S/.test(docText[start - 1])) {
    start--;
  }

  let end = from - 1;
  while (end < docText.length && /\S/.test(docText[end])) {
    end++;
  }

  return {
    token: docText.slice(start, end),
    start,
    end,
  };
}

// Tamil phonetic scoring
function tamilScore(tokenLatin: string, candidateTamil: string): number {
  let score = 0;
  const len = candidateTamil.length;

  // Prefer shorter sensible outputs
  score += Math.max(0, 20 - len);

  // Tamil common endings (heuristic)
  if (candidateTamil.endsWith('ம்')) score += 10;
  if (candidateTamil.endsWith('ல்')) score += 8;
  if (candidateTamil.endsWith('ன்') || candidateTamil.endsWith('ய்')) score += 6;
  if (candidateTamil.endsWith('்')) score += 4;

  // Penalize symbols / latin leakage
  if (/[A-Za-z0-9]/.test(candidateTamil)) score -= 30;

  // Token-specific heuristics
  const t = tokenLatin.toLowerCase();
  if (t.endsWith('m') && candidateTamil.endsWith('ம்')) score += 10;
  if (t.endsWith('l') && candidateTamil.endsWith('ல்')) score += 8;
  if (t.endsWith('n') && candidateTamil.endsWith('ன்')) score += 8;

  return score;
}

function rankTamil(tokenLatin: string, candidates: Array<{ text: string; score?: number }>) {
  return [...candidates]
    .map(c => ({ ...c, _score: tamilScore(tokenLatin, c.text) }))
    .sort((a, b) => (b as any)._score - (a as any)._score)
    .map(({ _score, ...rest }) => rest);
}

const TamilIMEPluginKey = new PluginKey<TamilIMEState>('tamilIME');

export const TamilIME = Extension.create<TamilIMEStorage>({
  name: 'tamilIME',

  addStorage() {
    return {
      token: null,
      start: null,
      end: null,
      candidates: [],
      index: 0,
      ghost: null,
      debounce: null,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin<TamilIMEState>({
        key: TamilIMEPluginKey,
        state: {
          init() {
            return { decorations: DecorationSet.empty };
          },
          apply(tr, value, oldState, newState) {
            // Check if this transaction has new decorations
            const meta = tr.getMeta(TamilIMEPluginKey);
            if (meta) {
              return meta as TamilIMEState;
            }
            // Map decorations through transaction
            const mapped = value.decorations.map(tr.mapping, tr.doc);
            return { decorations: mapped };
          },
        },
        props: {
          decorations(state) {
            const pluginState = TamilIMEPluginKey.getState(state);
            return pluginState?.decorations || DecorationSet.empty;
          },
        },
        view(editorView) {
          // Helper to update decorations from storage
          const updateDecos = () => {
            const storage = extension.storage as TamilIMEStorage;
            const state = editorView.state;
            let decos = DecorationSet.empty;

            if (storage.ghost && storage.start !== null && storage.end !== null) {
              const deco = Decoration.inline(storage.start, storage.end, {
                class: 'tamil-ime-ghost',
                'data-ghost': storage.ghost,
              });
              decos = DecorationSet.create(state.doc, [deco]);
            }

            // Update plugin state via transaction
            const tr = state.tr.setMeta(TamilIMEPluginKey, { decorations: decos });
            editorView.dispatch(tr);
          };

          // Expose update function to extension
          (extension as any)._updateDecorations = updateDecos;

          return {
            update() {
              // Decorations will be updated via updateDecos() call
            },
            destroy() {
              delete (extension as any)._updateDecorations;
            },
          };
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    const extension = this;

    return {
      Tab: () => extension.commit(),
      Enter: () => extension.commit(),
      ArrowDown: () => {
        const storage = extension.storage as TamilIMEStorage;
        if (!storage.candidates.length) return false;
        storage.index = (storage.index + 1) % storage.candidates.length;
        extension.updateGhost();
        return true;
      },
      ArrowUp: () => {
        const storage = extension.storage as TamilIMEStorage;
        if (!storage.candidates.length) return false;
        storage.index = (storage.index - 1 + storage.candidates.length) % storage.candidates.length;
        extension.updateGhost();
        return true;
      },
      Escape: () => {
        extension.clear();
        return true;
      },
      Space: () => {
        const storage = extension.storage as TamilIMEStorage;
        if (storage.ghost) {
          extension.commit();
          this.editor.commands.insertContent(' ');
          return true;
        }
        return false;
      },
    };
  },

  onUpdate({ editor }) {
    const storage = this.storage as TamilIMEStorage;
    const state = editor.state;
    const { token, start, end } = getTokenAtCaret(state);

    // Clear if no token or non-latin
    if (!token || token.length < 1 || !/^[A-Za-z]+$/.test(token)) {
      this.clear();
      return;
    }

    // Clear previous debounce
    if (storage.debounce) {
      clearTimeout(storage.debounce);
    }

    // Store token info
    storage.token = token;
    storage.start = start;
    storage.end = end;

    // Debounced fetch
    storage.debounce = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/transliterate/suggest?q=${encodeURIComponent(token)}&limit=8&mode=spoken`
        );

        if (!res.ok) {
          this.clear();
          return;
        }

        const data = await res.json();
        const raw = data.suggestions || [];
        const ranked = rankTamil(token, raw);

        if (!ranked.length) {
          this.clear();
          return;
        }

        storage.candidates = ranked;
        storage.index = 0;
        storage.ghost = ranked[0].text;

        // Update decoration
        this.updateDecoration();
      } catch (err) {
        console.error('[TamilIME] Fetch error:', err);
        this.clear();
      }
    }, 200);
  },

  commit() {
    const storage = this.storage as TamilIMEStorage;
    if (!storage.ghost || storage.start === null || storage.end === null) {
      return false;
    }

    this.editor
      .chain()
      .focus()
      .insertContentAt(
        { from: storage.start, to: storage.end },
        storage.ghost
      )
      .run();

    this.clear();
    return true;
  },

  updateGhost() {
    const storage = this.storage as TamilIMEStorage;
    if (storage.candidates[storage.index]) {
      storage.ghost = storage.candidates[storage.index].text;
      this.updateDecoration();
    }
  },

  updateDecoration() {
    const updateFn = (this as any)._updateDecorations;
    if (updateFn) {
      updateFn();
    }
  },

  clear() {
    const storage = this.storage as TamilIMEStorage;
    storage.token = null;
    storage.start = null;
    storage.end = null;
    storage.candidates = [];
    storage.index = 0;
    storage.ghost = null;

    if (storage.debounce) {
      clearTimeout(storage.debounce);
      storage.debounce = null;
    }

    // Clear decoration
    this.updateDecoration();
  },
});
