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

interface TamilIMEOptions {
  enabled?: boolean;
  autoCommitOnSpace?: boolean;
}

// Tamil character detection
function isTamilChar(ch: string): boolean {
  const code = ch.codePointAt(0);
  if (code === undefined) return false;
  // Tamil block U+0B80..U+0BFF
  return code >= 0x0b80 && code <= 0x0bff;
}

function isMostlyTamil(str: string): boolean {
  if (!str) return false;
  let tamil = 0;
  let other = 0;
  for (const c of str) {
    if (/\s/.test(c)) continue;
    if (isTamilChar(c)) tamil++;
    else other++;
  }
  return tamil > 0 && tamil >= other;
}

function isLatinToken(str: string): boolean {
  // Latin letters only (allow apostrophe for translit)
  return /^[A-Za-z][A-Za-z']*$/.test(str);
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

// Tamil orthography helpers
const DEP_VOWELS = new Set(['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ']);
const PULLI = '்';

function isDependentVowel(ch: string): boolean {
  return DEP_VOWELS.has(ch);
}

function tamilOrthographyPenalty(s: string): number {
  let p = 0;
  if (!s) return 999;

  // Latin/digits leakage
  if (/[A-Za-z0-9]/.test(s)) p += 50;

  // too long
  if (s.length > 12) p += (s.length - 12) * 3;

  // invalid sequences
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const prev = s[i - 1];

    // Dep vowel cannot start a word and should not follow whitespace
    if (isDependentVowel(ch) && (!prev || /\s/.test(prev))) p += 15;

    // Pulli cannot start
    if (ch === PULLI && i === 0) p += 15;

    // Double pulli
    if (ch === PULLI && prev === PULLI) p += 20;

    // Dep vowel right after pulli is usually invalid (very rough)
    if (isDependentVowel(ch) && prev === PULLI) p += 10;
  }

  return p;
}

function tokenHeuristicBoost(tokenLatin: string, candidateTamil: string): number {
  const t = tokenLatin.toLowerCase();
  let b = 0;
  // common "tamil" → தமிழ் preference
  if (t === 'tamil' && candidateTamil === 'தமிழ்') b += 40;

  // ending hints
  if (t.endsWith('m') && candidateTamil.endsWith('ம்')) b += 8;
  if (t.endsWith('l') && candidateTamil.endsWith('ல்')) b += 6;

  // common suffix: -il (in) → இல்
  if (t.endsWith('il') && candidateTamil.endsWith('இல்')) b += 10;

  return b;
}

function tamilCandidateScore(
  tokenLatin: string,
  candTamil: string,
  meta?: { recommended?: boolean; confidence?: number; score?: number }
): number {
  let score = 0;

  // base preference: shorter
  score += Math.max(0, 20 - candTamil.length);

  // meta confidence if available
  if (meta?.recommended) score += 20;
  if (typeof meta?.confidence === 'number') score += Math.round(meta.confidence * 30);
  if (typeof meta?.score === 'number') score += Math.round(meta.score * 30);

  // orthography penalty
  score -= tamilOrthographyPenalty(candTamil);

  // heuristic boost
  score += tokenHeuristicBoost(tokenLatin, candTamil);

  return score;
}

function rankCandidates(
  tokenLatin: string,
  candidates: Array<{ text: string; score?: number; recommended?: boolean; confidence?: number }>
) {
  return [...candidates]
    .map(c => ({
      ...c,
      _score: tamilCandidateScore(tokenLatin, c.text, {
        recommended: c.recommended,
        confidence: c.confidence,
        score: c.score,
      }),
    }))
    .sort((a, b) => (b as any)._score - (a as any)._score)
    .map(({ _score, ...rest }) => rest);
}

const TamilIMEPluginKey = new PluginKey<TamilIMEState>('tamilIME');

export const TamilIME = Extension.create<TamilIMEStorage, TamilIMEOptions>({
  name: 'tamilIME',

  addOptions() {
    return {
      enabled: true,
      autoCommitOnSpace: true,
    };
  },

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
          if (extension.options.autoCommitOnSpace) {
            extension.commit();
            this.editor.commands.insertContent(' ');
          } else {
            extension.clear();
          }
          return true;
        }
        return false;
      },
    };
  },

  onUpdate({ editor }) {
    // Skip if extension is disabled
    if (!this.options.enabled) {
      this.clear();
      return;
    }

    const storage = this.storage as TamilIMEStorage;
    const state = editor.state;
    const { token, start, end } = getTokenAtCaret(state);

    // Clear if no token
    if (!token || token.length < 1) {
      this.clear();
      return;
    }

    // Mixed language support: skip IME if token contains Tamil
    if (isMostlyTamil(token)) {
      this.clear();
      return;
    }

    // Only process Latin tokens
    if (!isLatinToken(token)) {
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
        const ranked = rankCandidates(token, raw);

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
