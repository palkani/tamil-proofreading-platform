// Home Page Editor - Simplified Tamil Editor with 200 Character Limit

class HomeEditor {
  constructor() {
    this.editor = document.getElementById('home-editor');
    this.charCount = document.getElementById('home-char-count');
    this.suggestionsContainer = document.getElementById('home-suggestions-container');
    this.boldBtn = document.getElementById('home-bold-btn');
    this.italicBtn = document.getElementById('home-italic-btn');
    this.underlineBtn = document.getElementById('home-underline-btn');
    this.maxWords = 200;
    
    // Auto-analysis state
    this.analysisTimeout = null;
    this.abortController = null;
    this.lastAnalyzedText = '';
    this.isAnalyzing = false;
    this.pendingAnalysis = false;
    
    // Tamil conversion dictionary (simplified version)
    this.tamilDict = {
      'a': 'அ', 'aa': 'ஆ', 'i': 'இ', 'ii': 'ஈ', 'u': 'உ', 'uu': 'ஊ',
      'e': 'எ', 'ee': 'ஏ', 'ai': 'ஐ', 'o': 'ஒ', 'oo': 'ஓ', 'au': 'ஔ',
      'ka': 'க', 'kaa': 'கா', 'ki': 'கி', 'kii': 'கீ', 'ku': 'கு', 'kuu': 'கூ',
      'nga': 'ங', 'ngaa': 'ஙா', 'ngi': 'ஙி', 'ngii': 'ஙீ',
      'cha': 'ச', 'chaa': 'சா', 'chi': 'சி', 'chii': 'சீ', 'chu': 'சு', 'chuu': 'சூ',
      'ja': 'ஜ', 'jaa': 'ஜா', 'ji': 'ஜி', 'jii': 'ஜீ',
      'nya': 'ஞ', 'nyaa': 'ஞா', 'nyi': 'ஞி', 'nyii': 'ஞீ',
      'ta': 'ட', 'taa': 'டா', 'ti': 'டி', 'tii': 'டீ', 'tu': 'டு', 'tuu': 'டூ',
      'na': 'ந', 'naa': 'நா', 'ni': 'நி', 'nii': 'நீ', 'nu': 'நு', 'nuu': 'நூ',
      'pa': 'ப', 'paa': 'பா', 'pi': 'பி', 'pii': 'பீ', 'pu': 'பு', 'puu': 'பூ',
      'ma': 'ம', 'maa': 'மா', 'mi': 'மி', 'mii': 'மீ', 'mu': 'மு', 'muu': 'மூ',
      'ya': 'ய', 'yaa': 'யா', 'yi': 'யி', 'yii': 'யீ', 'yu': 'யு', 'yuu': 'யூ',
      'ra': 'ர', 'raa': 'ரா', 'ri': 'ரி', 'rii': 'ரீ', 'ru': 'ரு', 'ruu': 'ரூ',
      'la': 'ல', 'laa': 'லா', 'li': 'லி', 'lii': 'லீ', 'lu': 'லு', 'luu': 'லூ',
      'va': 'வ', 'vaa': 'வா', 'vi': 'வி', 'vii': 'வீ', 'vu': 'வு', 'vuu': 'வூ',
      'zha': 'ழ', 'zhaa': 'ழா', 'zhi': 'ழி', 'zhii': 'ழீ',
      'lla': 'ள', 'llaa': 'ளா', 'lli': 'ளி', 'llii': 'ளீ',
      'rra': 'ற', 'rraa': 'றா', 'rri': 'றி', 'rrii': 'றீ',
      'nna': 'ண', 'nnaa': 'ணா', 'nni': 'ணி', 'nnii': 'ணீ',
      'vanakkam': 'வணக்கம்', 'nandri': 'நன்றி', 'tamil': 'தமிழ்',
      'eppadi': 'எப்படி', 'irukinga': 'இருக்கிங்க', 'nalladhu': 'நல்லது'
    };
    
    this.init();
  }
  
  init() {
    if (!this.editor) return;
    
    // Setup toolbar buttons
    if (this.boldBtn) {
      this.boldBtn.addEventListener('click', () => this.formatText('bold'));
    }
    if (this.italicBtn) {
      this.italicBtn.addEventListener('click', () => this.formatText('italic'));
    }
    if (this.underlineBtn) {
      this.underlineBtn.addEventListener('click', () => this.formatText('underline'));
    }
    
    // Handle input events
    this.editor.addEventListener('input', () => this.handleInput());
    this.editor.addEventListener('paste', (e) => this.handlePaste(e));
    
    // Handle space key for English-to-Tamil conversion
    this.editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    // Update word count on load
    this.updateWordCount();
  }
  
  formatText(command) {
    document.execCommand(command, false, null);
    this.editor.focus();
  }
  
  handleInput() {
    this.enforceWordLimit();
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    
    // Check if text contains mostly English characters
    const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    
    let processedText = text;
    if (englishRatio > 0.5) {
      // Convert English to Tamil
      processedText = this.convertEnglishToTamil(text);
    }
    
    // Enforce word limit
    const currentText = this.getPlainText();
    const currentWords = this.countWords(currentText);
    const remainingWords = this.maxWords - currentWords;
    const textWords = this.countWords(processedText);
    
    if (textWords > remainingWords) {
      // Truncate to fit remaining words
      const wordsArray = processedText.split(/\s+/);
      const textToInsert = wordsArray.slice(0, remainingWords).join(' ');
      document.execCommand('insertText', false, textToInsert);
    } else {
      document.execCommand('insertText', false, processedText);
    }
    
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  handleKeyDown(e) {
    if (e.key === ' ') {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || '';
      const words = textBeforeCursor.split(/\s/);
      const currentWord = words[words.length - 1];
      
      // If typing English word, convert to Tamil on space
      if (currentWord && /^[a-zA-Z]+$/.test(currentWord)) {
        const tamilWord = this.convertWordToTamil(currentWord);
        
        if (tamilWord && tamilWord !== currentWord) {
          e.preventDefault();
          
          // Replace English with Tamil
          const newRange = range.cloneRange();
          newRange.setStart(range.startContainer, range.startOffset - currentWord.length);
          newRange.setEnd(range.startContainer, range.startOffset);
          newRange.deleteContents();
          
          // Insert Tamil word + space
          document.execCommand('insertText', false, tamilWord + ' ');
        }
      }
    }
  }
  
  convertWordToTamil(word) {
    const lower = word.toLowerCase();
    return this.tamilDict[lower] || null;
  }
  
  convertEnglishToTamil(text) {
    const words = text.split(/(\s+)/);
    return words.map(word => {
      if (/^[a-zA-Z]+$/.test(word)) {
        return this.convertWordToTamil(word) || word;
      }
      return word;
    }).join('');
  }
  
  countWords(text) {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }

  enforceWordLimit() {
    const text = this.getPlainText();
    const wordCount = this.countWords(text);
    
    if (wordCount > this.maxWords) {
      // Truncate to max words
      const wordsArray = text.split(/\s+/);
      const truncated = wordsArray.slice(0, this.maxWords).join(' ');
      this.editor.textContent = truncated;
      
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(this.editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  
  updateWordCount() {
    const text = this.getPlainText();
    const count = this.countWords(text);
    const isOverLimit = count >= this.maxWords;
    
    if (this.charCount) {
      this.charCount.textContent = `${count} / ${this.maxWords} words`;
      this.charCount.style.color = isOverLimit ? '#dc2626' : '#6b7280';
    }
  }
  
  getPlainText() {
    return this.editor.textContent.trim();
  }
  
  scheduleAutoAnalysis() {
    // Clear existing timeout
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    
    // Debounce: Wait 1 second after user stops typing
    this.analysisTimeout = setTimeout(() => {
      this.autoAnalyze();
    }, 1000);
  }
  
  async autoAnalyze() {
    const text = this.getPlainText();
    
    // If empty, clear suggestions and reset
    if (!text) {
      this.lastAnalyzedText = '';
      this.displaySuggestions([]);
      return;
    }
    
    // If already analyzing, mark that we need to re-run after completion
    if (this.isAnalyzing) {
      this.pendingAnalysis = true;
      return;
    }
    
    // Skip if same as last analyzed
    if (text === this.lastAnalyzedText) {
      return;
    }
    
    // Check if text is mostly Tamil (not English)
    const tamilChars = text.match(/[\u0B80-\u0BFF]/g) || [];
    const tamilRatio = tamilChars.length / text.length;
    
    console.log('Tamil analysis check:', { 
      text, 
      tamilChars: tamilChars.length, 
      totalChars: text.length, 
      tamilRatio: tamilRatio.toFixed(2),
      willAnalyze: tamilRatio >= 0.3
    });
    
    if (tamilRatio < 0.3) {
      // Not enough Tamil content, skip analysis
      console.log('Skipping analysis - not enough Tamil content');
      return;
    }
    
    this.lastAnalyzedText = text;
    this.isAnalyzing = true;
    this.pendingAnalysis = false;
    
    // Show loading state
    this.showLoading();
    
    try {
      // Abort previous request if exists
      if (this.abortController) {
        this.abortController.abort();
      }
      
      this.abortController = new AbortController();
      
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: this.abortController.signal
      });
      
      if (!response.ok) {
        throw new Error('Analysis failed');
      }
      
      const data = await response.json();
      console.log('AI analysis response:', data);
      console.log('Number of suggestions:', (data.suggestions || []).length);
      this.displaySuggestions(data.suggestions || []);
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Auto-analysis error:', error);
        this.showError();
      }
    } finally {
      this.isAnalyzing = false;
      
      // If text changed during analysis, re-run
      if (this.pendingAnalysis) {
        this.pendingAnalysis = false;
        // Re-schedule analysis for new content
        this.scheduleAutoAnalysis();
      }
    }
  }
  
  showLoading() {
    if (!this.suggestionsContainer) return;
    
    this.suggestionsContainer.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-orange-200 border-t-orange-600 mb-4"></div>
        <p class="text-sm">Analyzing your Tamil text...</p>
      </div>
    `;
  }
  
  showError() {
    if (!this.suggestionsContainer) return;
    
    this.suggestionsContainer.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <p class="text-sm text-red-600">Analysis failed. Please try again.</p>
      </div>
    `;
  }
  
  displaySuggestions(suggestions) {
    if (!this.suggestionsContainer) return;
    
    // Get current text to check if editor is empty
    const currentText = this.getPlainText().trim();
    
    if (suggestions.length === 0) {
      // Only show "Looks great!" if there's actual text
      if (currentText) {
        this.suggestionsContainer.innerHTML = `
          <div class="text-center text-gray-500 py-8">
            <svg class="w-16 h-16 mx-auto mb-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <p class="text-sm font-semibold text-green-600">Looks great!</p>
            <p class="text-xs text-gray-400 mt-2">No grammar issues found</p>
          </div>
        `;
      } else {
        // Show default empty state
        this.suggestionsContainer.innerHTML = `
          <div class="text-center text-gray-500 py-8">
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <p class="text-sm">Type or paste Tamil text in the editor</p>
            <p class="text-xs text-gray-400 mt-2">AI suggestions appear automatically as you type</p>
          </div>
        `;
      }
      return;
    }
    
    const suggestionsHTML = suggestions.map((suggestion, index) => `
      <div class="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500 mb-3">
        <div class="flex items-start gap-2">
          <span class="inline-block px-2 py-1 bg-orange-600 text-white text-xs rounded font-semibold flex-shrink-0">
            ${suggestion.type || 'Grammar'}
          </span>
          <div class="flex-1">
            <p class="text-sm font-semibold text-gray-900 mb-1">${suggestion.title || 'Suggestion'}</p>
            <p class="text-sm text-gray-700 mb-2">${suggestion.description || ''}</p>
            ${suggestion.original && suggestion.suggestion ? `
              <p class="text-sm text-gray-700">
                <span class="line-through text-red-600">${suggestion.original}</span>
                <span class="mx-2">→</span>
                <span class="text-green-600 font-semibold">${suggestion.suggestion}</span>
              </p>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');
    
    this.suggestionsContainer.innerHTML = `
      <div class="space-y-3">
        <p class="text-sm font-semibold text-gray-700 mb-3">
          ${suggestions.length} ${suggestions.length === 1 ? 'suggestion' : 'suggestions'} found
        </p>
        ${suggestionsHTML}
      </div>
    `;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new HomeEditor();
});
