// AI Suggestions Panel Manager

class SuggestionsPanel {
  constructor(containerElement, summaryElement, acceptAllBtn) {
    this.container = containerElement;
    this.summary = summaryElement;
    this.acceptAllBtn = acceptAllBtn;
    this.suggestions = [];
    this.handledIds = new Set();
  }

  setSuggestions(suggestions) {
    this.suggestions = suggestions || [];
    this.render();
  }

  addSuggestions(newSuggestions) {
    console.log('[SuggestionsPanel] addSuggestions called with:', newSuggestions?.length, 'items');
    
    if (!newSuggestions || !Array.isArray(newSuggestions)) {
      console.log('[SuggestionsPanel] Invalid input - not an array');
      return;
    }
    
    // Filter out already handled suggestions
    const filtered = newSuggestions.filter(s => !this.handledIds.has(s.id));
    console.log('[SuggestionsPanel] After filtering handledIds:', filtered.length, 'items remain');
    
    this.suggestions = [...this.suggestions, ...filtered];
    console.log('[SuggestionsPanel] Total suggestions now:', this.suggestions.length);
    
    this.render();
  }

  clearSuggestions() {
    this.suggestions = [];
    this.handledIds.clear();
    this.render();
  }

  removeSuggestion(id) {
    this.suggestions = this.suggestions.filter(s => s.id !== id);
    this.handledIds.add(id);
    this.render();
  }

  getAcceptedCount() {
    return this.handledIds.size;
  }

  render() {
    console.log('[SuggestionsPanel] render() called with', this.suggestions.length, 'suggestions');
    
    // Update summary
    const total = this.suggestions.length;
    if (total === 0) {
      this.summary.textContent = 'No suggestions yet';
      this.acceptAllBtn.classList.add('hidden');
    } else {
      this.summary.textContent = `${total} suggestion${total > 1 ? 's' : ''} found`;
      this.acceptAllBtn.classList.remove('hidden');
    }

    // Clear container
    this.container.innerHTML = '';

    if (total === 0) {
      this.container.innerHTML = `
        <div class="text-center text-gray-400 py-12">
          <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          <p class="text-sm">Type or paste Tamil text in the editor</p>
          <p class="text-xs mt-2">Click "Check with Gemini AI" for suggestions</p>
        </div>
      `;
      return;
    }

    // Group suggestions by type
    const grouped = this.groupByType(this.suggestions);

    // Render each group
    Object.keys(grouped).forEach(type => {
      if (grouped[type].length === 0) return;

      const section = document.createElement('div');
      section.className = 'mb-6';

      const header = document.createElement('h4');
      header.className = 'text-sm font-semibold text-gray-700 mb-3 capitalize';
      header.textContent = this.getTypeLabel(type);
      section.appendChild(header);

      const cards = document.createElement('div');
      cards.className = 'space-y-3';

      grouped[type].forEach(suggestion => {
        cards.appendChild(this.createSuggestionCard(suggestion));
      });

      section.appendChild(cards);
      this.container.appendChild(section);
    });
  }

  groupByType(suggestions) {
    const groups = {
      grammar: [],
      style: [],
      clarity: [],
      spelling: [],
      punctuation: [],
      'word choice': [],
      alternative: []
    };

    suggestions.forEach(s => {
      const type = s.type || 'grammar';
      if (groups[type]) {
        groups[type].push(s);
      } else {
        groups.grammar.push(s);
      }
    });

    return groups;
  }

  getTypeLabel(type) {
    const labels = {
      grammar: 'Grammar',
      style: 'Style',
      clarity: 'Clarity',
      spelling: 'Spelling',
      punctuation: 'Punctuation',
      'word choice': 'Word Choice',
      alternative: 'Alternative Phrasings'
    };
    return labels[type] || 'Suggestions';
  }

  createSuggestionCard(suggestion) {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.setAttribute('data-suggestion-id', suggestion.id);

    // Parse original and suggested text
    let originalText = '';
    let suggestedText = '';

    if (suggestion.sourceText) {
      originalText = suggestion.sourceText;
    }

    if (suggestion.preview && suggestion.preview.includes('→')) {
      const parts = suggestion.preview.split('→');
      originalText = originalText || parts[0].trim();
      suggestedText = parts[1]?.trim() || '';
    } else if (suggestion.preview) {
      suggestedText = suggestion.preview;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <h5 class="font-medium text-gray-900 text-sm">${escapeHtml(suggestion.title)}</h5>
        <span class="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-700">${this.getTypeLabel(suggestion.type)}</span>
      </div>
      
      ${originalText || suggestedText ? `
        <div class="bg-gray-50 rounded-lg p-3 mb-3 text-sm tamil-text">
          ${originalText ? `
            <div class="mb-2">
              <span class="text-xs text-gray-500 block mb-1">Original:</span>
              <span class="text-gray-700">${escapeHtml(originalText)}</span>
            </div>
          ` : ''}
          ${suggestedText ? `
            <div>
              <span class="text-xs text-gray-500 block mb-1">Suggested:</span>
              <span class="text-green-700 font-medium">${escapeHtml(suggestedText)}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}
      
      <p class="text-sm text-gray-600 mb-3">${escapeHtml(suggestion.description || '')}</p>
      
      <div class="flex gap-2">
        ${suggestion.onApply ? `
          <button class="apply-btn flex-1 px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors">
            Apply
          </button>
        ` : ''}
        <button class="ignore-btn flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors">
          Ignore
        </button>
      </div>
    `;

    // Attach event listeners
    const applyBtn = card.querySelector('.apply-btn');
    const ignoreBtn = card.querySelector('.ignore-btn');

    if (applyBtn && suggestion.onApply) {
      applyBtn.addEventListener('click', () => {
        suggestion.onApply();
        this.removeSuggestion(suggestion.id);
        if (this.onAcceptSuggestion) {
          this.onAcceptSuggestion();
        }
      });
    }

    ignoreBtn.addEventListener('click', () => {
      if (suggestion.onIgnore) {
        suggestion.onIgnore();
      }
      this.removeSuggestion(suggestion.id);
    });

    return card;
  }
}

// Make it globally available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SuggestionsPanel;
}
