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
  fetching: boolean;
  abortController: AbortController | null;
  lastRequestId: number;
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
      fetching: false,
      abortController: null,
      lastRequestId: 0,
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
            const decos: Decoration[] = [];

            if (storage.ghost && storage.start !== null && storage.end !== null && storage.candidates.length > 0) {
              console.log('[TamilIME] 🎨 Creating dropdown widget at position', storage.end, 'with', storage.candidates.length, 'candidates');
              
              // Get the position coordinates for proper positioning
              let pos: { left: number; top: number; bottom: number } | null = null;
              try {
                pos = editorView.coordsAtPos(storage.end);
                console.log('[TamilIME] 🎨 Dropdown position:', pos);
              } catch (e) {
                console.warn('[TamilIME] ⚠️ Could not get coordinates:', e);
              }
              
              // Suggestion dropdown widget - appears below the typed text
              const dropdownWidget = Decoration.widget(storage.end, () => {
                const container = document.createElement('div');
                container.className = 'tamil-ime-dropdown';
                container.setAttribute('data-tamil-ime', 'true');
                
                // Get position coordinates (use cached pos or get fresh)
                let rect: { left: number; top: number; bottom: number };
                try {
                  const coords = editorView.coordsAtPos(storage.end);
                  // For fixed positioning, coordsAtPos already returns viewport coordinates
                  rect = {
                    left: coords.left,
                    top: coords.top,
                    bottom: coords.bottom
                  };
                } catch (e) {
                  // Fallback: try to get position from cached pos
                  if (pos) {
                    rect = pos;
                  } else {
                    // Last resort: use editor viewport position
                    const editorRect = editorView.dom.getBoundingClientRect();
                    rect = {
                      left: editorRect.left + 50,
                      top: editorRect.top + 100,
                      bottom: editorRect.top + 120
                    };
                  }
                }
                
                // Ensure dropdown is visible and properly positioned
                container.style.cssText = `
                  position: fixed !important;
                  display: block !important;
                  visibility: visible !important;
                  opacity: 1 !important;
                  z-index: 10000 !important;
                  left: ${rect.left}px !important;
                  top: ${rect.bottom + 8}px !important;
                  pointer-events: auto !important;
                `;
                
                console.log('[TamilIME] 🎨 Dropdown container created at:', { left: rect.left, top: rect.bottom + 8 });
                
                // Close button
                const closeBtn = document.createElement('button');
                closeBtn.className = 'tamil-ime-close';
                closeBtn.innerHTML = '×';
                closeBtn.setAttribute('aria-label', 'Close suggestions');
                closeBtn.onclick = (e) => {
                  e.stopPropagation();
                  extension.clear();
                };
                
                // Suggestions list
                const list = document.createElement('div');
                list.className = 'tamil-ime-suggestions-list';
                
                const maxSuggestions = Math.min(storage.candidates.length, 5);
                for (let i = 0; i < maxSuggestions; i++) {
                  const candidate = storage.candidates[i];
                  const item = document.createElement('div');
                  item.className = `tamil-ime-suggestion-item ${i === storage.index ? 'active' : ''}`;
                  item.setAttribute('data-index', i.toString());
                  
                  // Number badge
                  const number = document.createElement('span');
                  number.className = 'tamil-ime-number';
                  number.textContent = (i + 1).toString();
                  
                  // Text
                  const text = document.createElement('span');
                  text.className = 'tamil-ime-text';
                  text.textContent = candidate.text;
                  
                  item.appendChild(number);
                  item.appendChild(text);
                  
                  // Click handler
                  item.onclick = (e) => {
                    e.stopPropagation();
                    storage.index = i;
                    storage.ghost = candidate.text;
                    extension.commit();
                  };
                  
                  list.appendChild(item);
                }
                
                // Instruction text
                const instruction = document.createElement('div');
                instruction.className = 'tamil-ime-instruction';
                instruction.innerHTML = 'Press <strong>Space</strong> to select first option';
                
                container.appendChild(closeBtn);
                container.appendChild(list);
                container.appendChild(instruction);
                
                // Update position when editor scrolls or resizes
                const updatePosition = () => {
                  if (container.parentElement && storage.end !== null) {
                    try {
                      const coords = editorView.coordsAtPos(storage.end);
                      container.style.left = `${coords.left}px`;
                      container.style.top = `${coords.bottom + 8}px`;
                      console.log('[TamilIME] 🎨 Position updated to:', { left: coords.left, top: coords.bottom + 8 });
                    } catch (e) {
                      console.warn('[TamilIME] ⚠️ Position update failed:', e);
                    }
                  }
                };
                
                // Update position on scroll/resize (with throttling)
                let updateTimeout: NodeJS.Timeout | null = null;
                const throttledUpdate = () => {
                  if (updateTimeout) return;
                  updateTimeout = setTimeout(() => {
                    updatePosition();
                    updateTimeout = null;
                  }, 50);
                };
                
                // Add event listeners for position updates
                window.addEventListener('scroll', throttledUpdate, true);
                window.addEventListener('resize', throttledUpdate);
                if (editorView.dom) {
                  editorView.dom.addEventListener('scroll', throttledUpdate);
                }
                
                // Initial position update after DOM is ready
                setTimeout(updatePosition, 10);
                
                // Cleanup function
                const cleanup = () => {
                  window.removeEventListener('scroll', throttledUpdate, true);
                  window.removeEventListener('resize', throttledUpdate);
                  if (editorView.dom) {
                    editorView.dom.removeEventListener('scroll', throttledUpdate);
                  }
                  if (updateTimeout) {
                    clearTimeout(updateTimeout);
                  }
                };
                
                // Store cleanup on container for later removal
                (container as any)._cleanup = cleanup;
                
                // Cleanup on remove
                const originalParent = container.parentElement;
                const observer = new MutationObserver(() => {
                  if (!container.parentElement && originalParent) {
                    cleanup();
                    observer.disconnect();
                  }
                });
                if (originalParent) {
                  observer.observe(originalParent, { childList: true });
                }
                
                return container;
              }, {
                side: 1, // Render after the position
                key: 'tamil-ime-dropdown',
              });
              decos.push(dropdownWidget);
            }

            const decoSet = decos.length > 0
              ? DecorationSet.create(state.doc, decos)
              : DecorationSet.empty;

            console.log('[TamilIME] 🎨 updateDecos: Created', decos.length, 'decorations, decoSet size:', decoSet.size);

            // Update plugin state via transaction
            const tr = state.tr.setMeta(TamilIMEPluginKey, { decorations: decoSet });
            editorView.dispatch(tr);
            
            // Verify the decorations were applied
            setTimeout(() => {
              const appliedState = TamilIMEPluginKey.getState(editorView.state);
              console.log('[TamilIME] 🎨 Applied decorations state:', {
                hasDecorations: !!appliedState?.decorations,
                decorationSize: appliedState?.decorations?.size || 0
              });
              
              // Check if dropdown is in DOM
              const dropdown = document.querySelector('.tamil-ime-dropdown');
              console.log('[TamilIME] 🎨 Dropdown in DOM:', !!dropdown, dropdown ? {
                visible: dropdown instanceof HTMLElement ? window.getComputedStyle(dropdown).visibility : 'unknown',
                display: dropdown instanceof HTMLElement ? window.getComputedStyle(dropdown).display : 'unknown',
                opacity: dropdown instanceof HTMLElement ? window.getComputedStyle(dropdown).opacity : 'unknown',
                zIndex: dropdown instanceof HTMLElement ? window.getComputedStyle(dropdown).zIndex : 'unknown'
              } : null);
            }, 50);
          };

          // Expose update function to extension
          (extension as any)._updateDecorations = updateDecos;

          return {
            update(view, prevState) {
              // Cleanup old dropdowns
              const oldDecos = TamilIMEPluginKey.getState(prevState)?.decorations;
              if (oldDecos) {
                oldDecos.forEach((deco: any) => {
                  if (deco.spec?.key === 'tamil-ime-dropdown') {
                    const widget = deco.spec.widget;
                    if (widget && (widget as any)._cleanup) {
                      (widget as any)._cleanup();
                    }
                  }
                });
              }
              // Decorations will be updated via updateDecos() call
            },
            destroy() {
              // Cleanup all dropdowns
              const state = TamilIMEPluginKey.getState(editorView.state);
              if (state?.decorations) {
                state.decorations.forEach((deco: any) => {
                  if (deco.spec?.key === 'tamil-ime-dropdown') {
                    const widget = deco.spec.widget;
                    if (widget && (widget as any)._cleanup) {
                      (widget as any)._cleanup();
                    }
                  }
                });
              }
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
        storage.index = Math.min(storage.index + 1, storage.candidates.length - 1);
        extension.updateGhost();
        return true;
      },
      ArrowUp: () => {
        const storage = extension.storage as TamilIMEStorage;
        if (!storage.candidates.length) return false;
        storage.index = Math.max(storage.index - 1, 0);
        extension.updateGhost();
        return true;
      },
      Escape: () => {
        extension.clear();
        return true;
      },
      Space: () => {
        const storage = extension.storage as TamilIMEStorage;
        // Only commit if we have a ghost suggestion AND the current token is Latin (not Tamil)
        if (storage.ghost && storage.candidates.length > 0 && storage.token) {
          // Verify the token is still Latin (user might have changed it)
          const currentToken = getTokenAtCaret(this.editor.state);
          if (isLatinToken(currentToken.token) && isLatinToken(storage.token)) {
            if (extension.options.autoCommitOnSpace) {
              extension.commit();
              this.editor.commands.insertContent(' ');
              return true;
            } else {
              extension.clear();
              return true;
            }
          } else {
            // Token is now Tamil, don't commit
            console.log('[TamilIME] ⚠️ Space pressed but token is Tamil, clearing suggestions');
            extension.clear();
            return false; // Let space through normally
          }
        }
        // No ghost or token is Tamil - let space through normally
        if (storage.ghost) {
          extension.clear();
        }
        return false;
      },
      // Number keys 1-5 to select suggestions
      '1': () => {
        const storage = extension.storage as TamilIMEStorage;
        if (storage.candidates.length > 0) {
          storage.index = 0;
          extension.commit();
          return true;
        }
        return false;
      },
      '2': () => {
        const storage = extension.storage as TamilIMEStorage;
        if (storage.candidates.length > 1) {
          storage.index = 1;
          extension.commit();
          return true;
        }
        return false;
      },
      '3': () => {
        const storage = extension.storage as TamilIMEStorage;
        if (storage.candidates.length > 2) {
          storage.index = 2;
          extension.commit();
          return true;
        }
        return false;
      },
      '4': () => {
        const storage = extension.storage as TamilIMEStorage;
        if (storage.candidates.length > 3) {
          storage.index = 3;
          extension.commit();
          return true;
        }
        return false;
      },
      '5': () => {
        const storage = extension.storage as TamilIMEStorage;
        if (storage.candidates.length > 4) {
          storage.index = 4;
          extension.commit();
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

    // If token is the same and we already have candidates or are fetching, skip
    if (storage.token === token) {
      if (storage.fetching || storage.candidates.length > 0) {
        return;
      }
    }

    // Cancel any in-flight requests for different tokens
    if (storage.abortController && storage.token !== token) {
      storage.abortController.abort();
      storage.abortController = null;
      storage.fetching = false;
    }

    // Clear previous debounce
    if (storage.debounce) {
      clearTimeout(storage.debounce);
      storage.debounce = null;
    }

    // Store token info
    storage.token = token;
    storage.start = start;
    storage.end = end;
    storage.lastRequestId = (storage.lastRequestId || 0) + 1;
    const requestId = storage.lastRequestId;

    // Debounced fetch with longer delay to prevent duplicates
    storage.debounce = setTimeout(async () => {
      // Check if token changed during debounce or request was cancelled
      if (storage.token !== token || storage.lastRequestId !== requestId) {
        console.log('[TamilIME] Request cancelled - token changed or new request started');
        return;
      }

      // Double-check we're not already fetching for this token
      if (storage.fetching && storage.token === token) {
        console.log('[TamilIME] Already fetching for this token, skipping duplicate');
        return;
      }

      // Create new abort controller for this request
      const abortController = new AbortController();
      storage.abortController = abortController;
      storage.fetching = true;

      try {
        // Use the backend API directly - use smart mode (backend will handle mapping)
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
        const suggestUrl = `${apiBaseUrl}/ime/suggest?q=${encodeURIComponent(token)}&limit=8&mode=smart`;
        
        console.log('[TamilIME] Fetching suggestions for:', token, 'requestId:', requestId);

        const res = await fetch(suggestUrl, {
          credentials: 'include',
          signal: abortController.signal,
        });

        // Check again if token changed or request was cancelled
        if (storage.token !== token || storage.lastRequestId !== requestId || abortController.signal.aborted) {
          return;
        }

        if (!res.ok) {
          console.warn('[TamilIME] API returned non-OK status:', res.status);
          this.clear();
          return;
        }

        const data = await res.json();
        console.log('[TamilIME] API response for', token, ':', data);
        
        // Final check before processing
        if (storage.token !== token || storage.lastRequestId !== requestId || abortController.signal.aborted) {
          return;
        }
        
        // Handle both response formats: {suggestions: [...]} or direct array
        const suggestionsArray = data.suggestions || data.candidates || [];
        const raw = suggestionsArray.map((s: any) => ({
          text: s.word || s.text || s.ta || '',
          score: s.score || 0,
          recommended: s.recommended || s.label === 'Recommended',
          confidence: s.confidence,
        })).filter((s: any) => s.text);

        console.log('[TamilIME] Parsed suggestions for', token, ':', raw);

        const ranked = rankCandidates(token, raw);

        // Final check if token changed
        if (storage.token !== token || storage.lastRequestId !== requestId || abortController.signal.aborted) {
          return;
        }

        if (!ranked.length) {
          console.log('[TamilIME] No ranked candidates for', token);
          this.clear();
          return;
        }

        storage.candidates = ranked;
        storage.index = 0;
        storage.ghost = ranked[0].text;

        console.log('[TamilIME] ✅ Setting ghost text:', storage.ghost, 'candidates:', ranked.length, 'at position', storage.start, '-', storage.end);
        console.log('[TamilIME] ✅ All candidates:', ranked.map(c => c.text));

        // Force update decoration immediately and again after a delay
        if (storage.token === token && storage.lastRequestId === requestId) {
          console.log('[TamilIME] ✅ Updating decorations immediately');
          this.updateDecoration();
          
          // Update again after DOM settles
          requestAnimationFrame(() => {
            if (storage.token === token && storage.lastRequestId === requestId) {
              console.log('[TamilIME] ✅ Updating decorations in RAF');
              this.updateDecoration();
              
              // Final update after a short delay to ensure positioning is correct
              setTimeout(() => {
                if (storage.token === token && storage.lastRequestId === requestId) {
                  console.log('[TamilIME] ✅ Final decoration update');
                  this.updateDecoration();
                }
              }, 100);
            }
          });
        } else {
          console.log('[TamilIME] ⚠️ Skipping decoration update - token/request changed');
        }
      } catch (err: any) {
        // Ignore abort errors
        if (err.name === 'AbortError') {
          console.log('[TamilIME] Request aborted for', token);
          return;
        }
        console.error('[TamilIME] Fetch error for', token, ':', err);
        if (storage.token === token && storage.lastRequestId === requestId) {
          this.clear();
        }
      } finally {
        if (storage.abortController === abortController) {
          storage.abortController = null;
        }
        storage.fetching = false;
        storage.debounce = null;
      }
    }, 400); // Increased debounce to 400ms to reduce duplicate calls
  },

  commit() {
    const storage = this.storage as TamilIMEStorage;
    if (!storage.ghost || storage.start === null || storage.end === null) {
      console.log('[TamilIME] ⚠️ Cannot commit - missing ghost or positions');
      return false;
    }

    // Verify the token at this position is still Latin (not Tamil)
    const currentToken = getTokenAtCaret(this.editor.state);
    if (!isLatinToken(currentToken.token)) {
      console.log('[TamilIME] ⚠️ Cannot commit - token is not Latin:', currentToken.token);
      this.clear();
      return false;
    }

    // Double-check the token matches what we expect
    const docText = this.editor.state.doc.textBetween(0, this.editor.state.doc.content.size, '\n', '\n');
    const tokenAtPosition = docText.slice(storage.start, storage.end);
    if (!isLatinToken(tokenAtPosition)) {
      console.log('[TamilIME] ⚠️ Cannot commit - token at position is not Latin:', tokenAtPosition);
      this.clear();
      return false;
    }

    console.log('[TamilIME] ✅ Committing suggestion:', storage.ghost, 'replacing:', tokenAtPosition);
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
      console.log('[TamilIME] updateDecoration called, _updateDecorations exists:', !!updateFn);
      requestAnimationFrame(() => {
        try {
          updateFn();
          console.log('[TamilIME] Decorations updated successfully');
        } catch (err) {
          console.error('[TamilIME] Error updating decorations:', err);
        }
      });
    } else {
      console.warn('[TamilIME] _updateDecorations function not found - decorations may not update');
    }
  },

  clear() {
    const storage = this.storage as TamilIMEStorage;
    
    // Cancel any in-flight requests
    if (storage.abortController) {
      storage.abortController.abort();
      storage.abortController = null;
    }

    storage.token = null;
    storage.start = null;
    storage.end = null;
    storage.candidates = [];
    storage.index = 0;
    storage.ghost = null;
    storage.fetching = false;

    if (storage.debounce) {
      clearTimeout(storage.debounce);
      storage.debounce = null;
    }

    // Clear decoration
    this.updateDecoration();
  },
});
