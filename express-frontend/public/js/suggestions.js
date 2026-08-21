// AI Suggestions Panel Manager

class SuggestionsPanel {
  constructor(containerElement, summaryElement, acceptAllBtn) {
    this.container = containerElement;
    this.summary = summaryElement;
    this.acceptAllBtn = acceptAllBtn;
    this.suggestions = [];
    this.handledIds = new Set();
    // emptyState controls what we show when suggestions.length === 0
    // - 'idle': initial guidance before analysis
    // - 'no-issues': analysis completed and no corrections found
    // - 'resolved': user applied/ignored all suggestions for this run
    this.emptyState = 'idle';
    // Index of the currently focused suggestion (-1 = none)
    this.focusedIndex = -1;
  }

  normalizeComparable(s) {
    try {
      return String(s || '')
        .normalize('NFC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[\"'“”‘’«»‹›「」『』『』《》〈〉「」『』ʻʼ’‘‚‛„‟\u2018\u2019\u201C\u201D\u201E\u2039\u203A\u00AB\u00BB\u201A\u201B]+/, '')
        .replace(/[\"'“”‘’«»‹›「」『』『』《》〈〉「」『』ʻʼ’‘‚‛„‟\u2018\u2019\u201C\u201D\u201E\u2039\u203A\u00AB\u00BB\u201A\u201B]+$/, '')
        .trim();
    } catch (_e) {
      return String(s || '').replace(/\s+/g, ' ').trim();
    }
  }

  hashString(str) {
    // FNV-1a (fast + stable, good enough for IDs)
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  stableKeyFromSuggestion(s) {
    const type = this.normalizeComparable(s?.type || 'grammar').toLowerCase();
    const src = this.normalizeComparable(s?.sourceText || '');
    const prev = this.normalizeComparable(s?.preview || '');
    // Dedupe by (type, original, corrected) so same correction shows once even if reason differs
    if (prev && prev.includes('→')) {
      const parts = prev.split('→').map(p => this.normalizeComparable(p));
      const original = src || parts[0] || '';
      const corrected = parts[1] || '';
      if (original && corrected) return `${type}|${original}|${corrected}`;
    }
    const title = this.normalizeComparable(s?.title || '');
    const desc = this.normalizeComparable(s?.description || '');
    return `${type}|${title}|${desc}|${src}|${prev}`;
  }

  dedupeSuggestions(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const s of list) {
      if (!s) continue;
      const key = this.stableKeyFromSuggestion(s);
      const stableId = s.id || `sugg-${this.hashString(key)}`;
      if (seen.has(stableId)) continue;
      seen.add(stableId);
      out.push({ ...s, id: stableId });
    }
    return out;
  }

  setSuggestions(suggestions) {
    this.suggestions = this.dedupeSuggestions(suggestions || []);
    this.emptyState = this.suggestions.length ? 'idle' : this.emptyState;
    this.render();
  }

  addSuggestions(newSuggestions) {
    console.log('[SuggestionsPanel] addSuggestions called with:', newSuggestions?.length, 'items');
    
    if (!newSuggestions || !Array.isArray(newSuggestions)) {
      console.log('[SuggestionsPanel] Invalid input - not an array');
      return;
    }
    
    // Ensure stable IDs + dedupe, then filter out already handled suggestions
    const normalized = this.dedupeSuggestions(newSuggestions);
    const filtered = normalized.filter(s => !this.handledIds.has(s.id));
    console.log('[SuggestionsPanel] After filtering handledIds:', filtered.length, 'items remain');
    
    this.suggestions = this.dedupeSuggestions([...this.suggestions, ...filtered]);
    console.log('[SuggestionsPanel] Total suggestions now:', this.suggestions.length);
    if (this.suggestions.length > 0) {
      this.emptyState = 'idle';
    }
    
    this.render();
  }

  setEmptyState(state) {
    this.emptyState = state || 'idle';
    this.render();
  }

  clearSuggestions() {
    this.suggestions = [];
    this.handledIds.clear();
    this.emptyState = 'idle';
    this.focusedIndex = -1;
    const nav = document.getElementById('correction-navigator');
    if (nav) { nav.classList.remove('visible'); nav.innerHTML = ''; }
    if (this.onClearHighlights) this.onClearHighlights();
    this.render();
  }

  removeSuggestion(id) {
    const removedIdx = this.suggestions.findIndex(s => s.id === id);
    this.suggestions = this.suggestions.filter(s => s.id !== id);
    this.handledIds.add(id);
    // Adjust focusedIndex so navigator stays consistent
    if (this.focusedIndex >= 0 && removedIdx !== -1 && removedIdx <= this.focusedIndex) {
      this.focusedIndex = Math.max(0, this.focusedIndex - 1);
    }
    if (this.focusedIndex >= this.suggestions.length) {
      this.focusedIndex = this.suggestions.length - 1;
    }
    if (this.suggestions.length === 0 && this.handledIds.size > 0) {
      this.emptyState = 'resolved';
      this.focusedIndex = -1;
      const nav = document.getElementById('correction-navigator');
      if (nav) { nav.classList.remove('visible'); nav.innerHTML = ''; }
    } else {
      this._renderNavigator();
    }
    this.render();
  }

  getAcceptedCount() {
    return this.handledIds.size;
  }

  /**
   * Highlight the suggestion card with the given id and show the navigator.
   * Called when the user clicks an underlined correction span in the editor.
   */
  focusSuggestion(id) {
    const idx = this.suggestions.findIndex(s => s.id === id);
    if (idx === -1) return;
    this.focusedIndex = idx;
    this._renderNavigator();
    // Scroll the card into view and apply focus styling
    document.querySelectorAll('.suggestion-card.focused').forEach(c => c.classList.remove('focused'));
    const card = document.querySelector(`.suggestion-card[data-suggestion-id="${id}"]`);
    if (!card) return;
    card.classList.add('focused');
    // Pulse animation to make the focused card visually obvious
    card.classList.remove('suggestion-card-pulse');
    void card.offsetWidth; // force reflow to restart animation
    card.classList.add('suggestion-card-pulse');
    // Scroll ONLY the AI panel container — never the editor or the page.
    // scrollIntoView() walks ALL ancestors, which causes the editor to jump.
    const panel = document.getElementById('suggestions-container');
    if (panel) {
      const panelRect = panel.getBoundingClientRect();
      const cardRect  = card.getBoundingClientRect();
      // Always scroll so the card appears near the top of the panel with a 16px offset
      const targetScrollTop = panel.scrollTop + (cardRect.top - panelRect.top) - 16;
      panel.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
    }
  }

  /**
   * Move focus to the next (+1) or previous (-1) correction, looping around.
   * Also activates the corresponding editor highlight span.
   */
  navigateCorrection(delta) {
    const total = this.suggestions.length;
    if (total === 0) return;
    if (this.focusedIndex < 0) this.focusedIndex = 0;
    else this.focusedIndex = (this.focusedIndex + delta + total) % total;
    const suggestion = this.suggestions[this.focusedIndex];
    if (!suggestion) return;
    this.focusSuggestion(suggestion.id);
    // Activate the matching editor span
    document.querySelectorAll('.correction-highlight.correction-active').forEach(s => s.classList.remove('correction-active'));
    const span = document.querySelector(`.correction-highlight[data-suggestion-id="${suggestion.id}"]`);
    if (span) {
      span.classList.add('correction-active');
      // Scroll only the editor's scroll wrapper, not the whole page.
      const editorScroll = span.closest('.overflow-auto') || span.closest('[data-editor-scroll]');
      if (editorScroll) {
        const wrapRect  = editorScroll.getBoundingClientRect();
        const spanRect  = span.getBoundingClientRect();
        const alreadyVisible = spanRect.top >= wrapRect.top && spanRect.bottom <= wrapRect.bottom;
        if (!alreadyVisible) {
          const target = editorScroll.scrollTop + (spanRect.top - wrapRect.top) - (wrapRect.height / 2 - spanRect.height / 2);
          editorScroll.scrollTo({ top: target, behavior: 'smooth' });
        }
      } else {
        // Fallback: no wrapper found, don't scroll the page
        span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  /** Render the "X of Y" navigator bar above the suggestions list. */
  _renderNavigator() {
    const nav = document.getElementById('correction-navigator');
    if (!nav) return;
    const total = this.suggestions.length;
    if (total === 0 || this.focusedIndex < 0) {
      nav.classList.remove('visible');
      nav.innerHTML = '';
      return;
    }
    const s = this.suggestions[this.focusedIndex];
    const label = s ? (s.title || 'Correction') : 'Correction';
    nav.classList.add('visible');
    nav.innerHTML = `
      <span class="correction-nav-label">${escapeHtml(label)}</span>
      <div class="correction-nav-btns">
        <button class="correction-nav-btn" data-nav="-1" title="Previous">&#8249;</button>
        <span class="correction-nav-count">${this.focusedIndex + 1} / ${total}</span>
        <button class="correction-nav-btn" data-nav="1" title="Next">&#8250;</button>
      </div>
    `;
    nav.querySelectorAll('.correction-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.navigateCorrection(parseInt(btn.dataset.nav, 10)));
    });
  }

  render() {
    console.log('[SuggestionsPanel] render() called with', this.suggestions.length, 'suggestions');
    
    // Update summary
    const total = this.suggestions.length;
    if (total === 0) {
      if (this.emptyState === 'resolved') {
        this.summary.textContent = 'All set!';
      } else if (this.emptyState === 'no-issues') {
        this.summary.textContent = 'Looks solid!';
      } else {
        this.summary.textContent = 'No suggestions yet';
      }
      this.acceptAllBtn.classList.add('hidden');
    } else {
      this.summary.textContent = `${total} suggestion${total > 1 ? 's' : ''} found`;
      this.acceptAllBtn.classList.remove('hidden');
    }

    // Clear container
    this.container.innerHTML = '';

    if (total === 0) {
      if (this.emptyState === 'resolved') {
        this.container.innerHTML = `
          <div class="text-center py-12">
            <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg class="w-7 h-7 text-green-700" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <p class="text-base font-semibold text-gray-900">All set! You’ve applied all suggestions. Keep writing—ProofTamil will help fine-tune as you go</p>
          </div>
        `;
      } else if (this.emptyState === 'no-issues') {
        this.container.innerHTML = `
          <div class="text-center py-12">
            <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg class="w-7 h-7 text-green-700" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <p class="text-base font-semibold text-gray-900">Looks solid! Keep writing—ProofTamil will help fine-tune as you go</p>
          </div>
        `;
      } else {
        this.container.innerHTML = `
          <div class="text-center text-gray-400 py-12">
            <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            <p class="text-sm">Type or paste Tamil text in the editor</p>
            <p class="text-xs mt-2">Click "Check with ProofTamil AI" for suggestions</p>
          </div>
        `;
      }
      return;
    }

    // Render as a flat list in type-priority order (each card carries its own badge).
    // Grammar errors first, then spelling, punctuation, style/clarity, others.
    const TYPE_ORDER = [
      'grammar', 'spelling', 'punctuation', 'incomplete word', 'sandhi',
      'missing space', 'phonetic', 'case', 'space',
      'word choice', 'style', 'clarity', 'suggestion', 'alternative',
    ];
    const grouped = this.groupByType(this.suggestions);
    const list = document.createElement('div');

    // Render known types in priority order
    TYPE_ORDER.forEach(type => {
      if (!grouped[type] || grouped[type].length === 0) return;
      grouped[type].forEach(s => list.appendChild(this.createSuggestionCard(s)));
    });

    // Append any types not in TYPE_ORDER (future-proof)
    Object.keys(grouped).forEach(type => {
      if (TYPE_ORDER.includes(type) || !grouped[type] || grouped[type].length === 0) return;
      grouped[type].forEach(s => list.appendChild(this.createSuggestionCard(s)));
    });

    this.container.appendChild(list);
  }

  groupByType(suggestions) {
    const groups = {
      grammar: [],
      spelling: [],
      punctuation: [],
      'incomplete word': [],
      sandhi: [],
      'missing space': [],
      phonetic: [],
      case: [],
      space: [],
      'word choice': [],
      style: [],
      clarity: [],
      suggestion: [],
      alternative: [],
    };

    suggestions.forEach(s => {
      const type = (s.type || 'grammar').toLowerCase();
      if (groups[type]) {
        groups[type].push(s);
      } else {
        groups.grammar.push(s);
      }
    });

    return groups;
  }

  getTypeLabel(type) {
    // Bilingual badge: Tamil · English (shared shape with the home editor).
    const t = (type || 'grammar').toLowerCase();
    const ta = {
      grammar: 'இலக்கணம்', style: 'நடை', clarity: 'தெளிவு', spelling: 'எழுத்துப்பிழை',
      punctuation: 'நிறுத்தற்குறி', 'word choice': 'சொல் தேர்வு',
      'incomplete word': 'முழுமையற்ற சொல்', sandhi: 'புணர்ச்சி', agreement: 'ஒப்புமை',
      'missing space': 'இடைவெளி குறைபாடு', phonetic: 'ஒலியியல்', case: 'வேற்றுமை',
      space: 'இடைவெளி', suggestion: 'பரிந்துரை', alternative: 'மாற்று வழிகள்',
    };
    const en = {
      grammar: 'Grammar', style: 'Style', clarity: 'Clarity', spelling: 'Spelling',
      punctuation: 'Punctuation', 'word choice': 'Word Choice',
      'incomplete word': 'Incomplete Word', sandhi: 'Sandhi', agreement: 'Agreement',
      'missing space': 'Missing Space', phonetic: 'Phonetic', case: 'Case',
      space: 'Space', suggestion: 'Suggestion', alternative: 'Alternative',
    };
    const cap = t.charAt(0).toUpperCase() + t.slice(1);
    return `${ta[t] || cap} · ${en[t] || cap}`;
  }

  /** Returns a CSS class name for the type badge based on suggestion type. */
  _getTypeBadgeClass(type) {
    const t = (type || '').toLowerCase().trim();
    const map = {
      grammar:           'sugg-type-grammar',
      punctuation:       'sugg-type-punctuation',
      spelling:          'sugg-type-spelling',
      'incomplete word': 'sugg-type-incomplete-word',
      style:             'sugg-type-style',
      clarity:           'sugg-type-clarity',
      'word choice':     'sugg-type-word-choice',
      sandhi:            'sugg-type-sandhi',
      'missing space':   'sugg-type-missing-space',
      phonetic:          'sugg-type-phonetic',
      case:              'sugg-type-case',
      space:             'sugg-type-space',
    };
    return map[t] || 'sugg-type-default';
  }

  createSuggestionCard(suggestion) {
    const card = document.createElement('div');
    // `suggestion-card` is kept for the focus/nav selectors; its box CSS is
    // neutralised in workspace.ejs so these Tailwind classes — identical to the home
    // editor — control the look. One shared AI-Assistant card theme across both.
    card.className = 'suggestion-card bg-accent-50 rounded-lg p-4 border-l-4 border-primary-500 mb-3';
    card.setAttribute('data-suggestion-id', suggestion.id);

    // Resolve original and suggested text
    let originalText = (suggestion.sourceText || '').trim();
    let suggestedText = '';

    if (suggestion.preview && suggestion.preview.includes('→')) {
      const parts = suggestion.preview.split('→');
      if (!originalText) originalText = parts[0].trim();
      suggestedText = (parts[1] || '').trim();
    } else if (suggestion.preview) {
      suggestedText = suggestion.preview.trim();
    }

    const typeLabel  = this.getTypeLabel(suggestion.type);
    const reason     = (suggestion.description || '').trim();
    const hasApply   = !!suggestion.onApply;
    const occCount   = suggestion.occurrenceCount || 1;
    const acceptText = occCount > 1 ? `Accept all ${occCount}` : 'Accept';

    card.innerHTML = `
      <div class="flex items-start gap-2">
        <span class="inline-block px-2 py-1 bg-primary-600 text-white text-xs rounded font-semibold flex-shrink-0 whitespace-nowrap">${escapeHtml(typeLabel)}</span>
        <div class="flex-1 min-w-0">
          ${(originalText && suggestedText) ? `
            <p class="text-sm text-gray-700 mb-2">
              <span class="line-through text-red-600 tamil-text">"${escapeHtml(originalText)}"</span>
              <span class="mx-1 text-gray-400">→</span>
              <span class="text-green-600 font-semibold tamil-text">"${escapeHtml(suggestedText)}"</span>
            </p>
          ` : (suggestedText ? `
            <p class="text-sm mb-2"><span class="text-green-600 font-semibold tamil-text">"${escapeHtml(suggestedText)}"</span></p>
          ` : '')}
          ${reason ? `<p class="text-sm text-gray-700 mb-2 tamil-text">${escapeHtml(reason)}</p>` : ''}
          <div class="flex gap-2 mt-3 pt-3 border-t border-primary-200">
            ${hasApply ? `<button type="button" class="sugg-accept-btn flex-1 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors">${escapeHtml(acceptText)}</button>` : ''}
            <button type="button" class="sugg-ignore-btn flex-1 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 transition-colors">Ignore</button>
          </div>
        </div>
      </div>
    `;

    // Accept button
    const acceptBtn = card.querySelector('.sugg-accept-btn');
    if (acceptBtn && suggestion.onApply) {
      acceptBtn.addEventListener('click', () => {
        suggestion.onApply();
        this.removeSuggestion(suggestion.id);
        if (this.onAcceptSuggestion) this.onAcceptSuggestion();
      });
    }

    // Ignore button
    card.querySelector('.sugg-ignore-btn').addEventListener('click', () => {
      if (suggestion.onIgnore) suggestion.onIgnore();
      this.removeSuggestion(suggestion.id);
    });

    return card;
  }
}

// Make it globally available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SuggestionsPanel;
}
