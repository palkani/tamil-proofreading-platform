class HomeEditor {
  constructor() {
    this.editor = document.getElementById('home-editor');
    this.charCount = document.getElementById('home-char-count');
    this.suggestionsContainer = document.getElementById('home-suggestions-container');
    this.boldBtn = document.getElementById('home-bold-btn');
    this.italicBtn = document.getElementById('home-italic-btn');
    this.underlineBtn = document.getElementById('home-underline-btn');
    this.maxWords = 200;
    
    this.analysisTimeout = null;
    this.abortController = null;
    this.lastAnalyzedText = '';
    this.isAnalyzing = false;
    this.pendingAnalysis = false;
    
    this.translitHelper = null;
    this.autocompleteDropdown = null;
    
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
    console.log('[INIT] HomeEditor init called, editor element:', this.editor ? 'FOUND' : 'NOT FOUND');
    if (!this.editor) {
      console.log('[INIT] ERROR: home-editor element not found! Cannot initialize.');
      return;
    }
    console.log('[INIT] Editor element found, attaching event listeners');
    
    this.createAutocompleteDropdown();
    this.initTransliterationHelper();
    
    if (this.boldBtn) {
      this.boldBtn.addEventListener('click', () => this.formatText('bold'));
    }
    if (this.italicBtn) {
      this.italicBtn.addEventListener('click', () => this.formatText('italic'));
    }
    if (this.underlineBtn) {
      this.underlineBtn.addEventListener('click', () => this.formatText('underline'));
    }
    
    this.editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.editor.addEventListener('input', () => this.handleInput());
    this.editor.addEventListener('paste', (e) => this.handlePaste(e));
    
    this.updateWordCount();
  }
  
  createAutocompleteDropdown() {
    let dropdown = document.getElementById('home-translit-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'home-translit-dropdown';
      dropdown.className = 'hidden bg-white border-2 border-orange-200 rounded-lg shadow-xl overflow-hidden';
      dropdown.style.cssText = 'min-width: 200px; max-height: 250px; overflow-y: auto;';
      dropdown.innerHTML = '<div class="suggestions-list"></div>';
      document.body.appendChild(dropdown);
    }
    this.autocompleteDropdown = dropdown;
  }
  
  initTransliterationHelper() {
    if (typeof TransliterationHelper === 'undefined') {
      console.warn('[HomeEditor] TransliterationHelper not loaded, using fallback');
      return;
    }
    
    this.translitHelper = new TransliterationHelper({
      debounceMs: 200,
      apiEndpoint: '/api/v1/transliterate',
      maxSuggestions: 5,
      minWordLength: 2
    });
    
    this.translitHelper.attach(
      this.editor,
      this.autocompleteDropdown,
      (tamilWord) => {
        this.updateWordCount();
        this.scheduleAutoAnalysis();
      }
    );
  }
  
  formatText(command) {
    document.execCommand(command, false, null);
    this.editor.focus();
  }
  
  handleKeyDown(e) {
    if (e.key === ' ' || e.code === 'Space') {
      if (this.translitHelper && this.translitHelper.isVisible) {
        this.translitHelper.hide();
      }
      
      const handled = this.handleSpaceKey(e);
      if (handled) {
        e.preventDefault();
        return;
      }
    }
    
    if (e.key >= '1' && e.key <= '5') {
      if (this.translitHelper && this.translitHelper.isVisible) {
        const index = parseInt(e.key) - 1;
        if (index < this.translitHelper.currentSuggestions.length) {
          e.preventDefault();
          this.translitHelper.selectByIndex(index);
          return;
        }
      }
    }
  }
  
  handleSpaceKey(e) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    
    let lastWord = '';
    
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const text = range.startContainer.textContent || '';
      const caretOffset = range.startOffset;
      
      let wordStart = caretOffset;
      while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
        wordStart--;
      }
      lastWord = text.substring(wordStart, caretOffset);
    } else {
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(this.editor);
      preCaretRange.setEnd(range.startContainer, range.startOffset);
      const textBefore = preCaretRange.toString();
      
      let wordStart = textBefore.length;
      while (wordStart > 0 && !/\s/.test(textBefore[wordStart - 1])) {
        wordStart--;
      }
      lastWord = textBefore.substring(wordStart);
    }
    
    if (!lastWord || !/^[a-zA-Z]+$/.test(lastWord)) {
      return false;
    }
    
    const lower = lastWord.toLowerCase();
    let tamilWord = this.tamilDict[lower];
    
    if (!tamilWord && typeof transliterateToTamil === 'function') {
      tamilWord = transliterateToTamil(lastWord);
    }
    
    if (tamilWord && tamilWord !== lastWord) {
      this.replaceWordWithExecCommand(lastWord, tamilWord);
      return true;
    }
    
    if (this.translitHelper && this.translitHelper.cache.has(lastWord)) {
      const suggestions = this.translitHelper.cache.get(lastWord);
      if (suggestions && suggestions.length > 0) {
        this.replaceWordWithExecCommand(lastWord, suggestions[0]);
        return true;
      }
    }
    
    this.fetchAndConvert(lastWord);
    return true;
  }
  
  replaceWordWithExecCommand(englishWord, tamilWord) {
    const selection = window.getSelection();
    if (!selection.rangeCount) {
      this.editor.focus();
      document.execCommand('insertText', false, tamilWord + ' ');
      this.updateWordCount();
      this.scheduleAutoAnalysis();
      return;
    }
    
    const range = selection.getRangeAt(0);
    
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(this.editor);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preCaretRange.toString();
    
    const wordStart = textBefore.lastIndexOf(englishWord);
    
    if (wordStart === -1 || textBefore.length === 0) {
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent || '';
        const caretOffset = range.startOffset;
        
        let localWordStart = caretOffset;
        while (localWordStart > 0 && !/\s/.test(text[localWordStart - 1])) {
          localWordStart--;
        }
        
        const localWord = text.substring(localWordStart, caretOffset);
        if (localWord === englishWord) {
          const newRange = document.createRange();
          newRange.setStart(range.startContainer, localWordStart);
          newRange.setEnd(range.startContainer, caretOffset);
          selection.removeAllRanges();
          selection.addRange(newRange);
          document.execCommand('insertText', false, tamilWord + ' ');
          this.updateWordCount();
          this.scheduleAutoAnalysis();
          return;
        }
      }
      
      document.execCommand('insertText', false, tamilWord + ' ');
      this.updateWordCount();
      this.scheduleAutoAnalysis();
      return;
    }
    
    this.selectTextRange(wordStart, wordStart + englishWord.length);
    document.execCommand('insertText', false, tamilWord + ' ');
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  selectTextRange(start, end) {
    const walker = document.createTreeWalker(
      this.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let charCount = 0;
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;
    let textNode = walker.nextNode();
    
    while (textNode) {
      const nodeLength = textNode.textContent.length;
      const nextCharCount = charCount + nodeLength;
      
      if (!startNode && start >= charCount && start < nextCharCount) {
        startNode = textNode;
        startOffset = start - charCount;
      }
      
      if (end >= charCount && end <= nextCharCount) {
        endNode = textNode;
        endOffset = end - charCount;
        break;
      }
      
      charCount = nextCharCount;
      textNode = walker.nextNode();
    }
    
    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  
  async fetchAndConvert(englishWord) {
    try {
      const response = await fetch('/api/v1/transliterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: englishWord })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.suggestions?.[0]) {
          const suggestion = data.suggestions[0];
          const tamilWord = typeof suggestion === 'string' ? suggestion : suggestion.word;
          
          if (this.translitHelper) {
            this.translitHelper.addToCache(englishWord, data.suggestions.map(s => 
              typeof s === 'string' ? s : s.word
            ));
          }
          
          this.replaceWordWithExecCommand(englishWord, tamilWord);
          return;
        }
      }
    } catch (err) {
      console.error('[HomeEditor] Fetch error:', err);
    }
    
    document.execCommand('insertText', false, ' ');
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }

  handleInput() {
    this.enforceWordLimit();
    this.updateWordCount();
    
    if (this.translitHelper) {
      this.translitHelper.triggerAutocomplete();
    }
    
    this.scheduleAutoAnalysis();
  }
  
  moveCursorToEnd() {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(this.editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    this.editor.focus();
  }

  insertSuggestion(index) {
    if (this.translitHelper) {
      this.translitHelper.selectByIndex(index);
    }
  }
  
  handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    
    const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    
    let processedText = text;
    if (englishRatio > 0.5) {
      processedText = this.convertEnglishToTamil(text);
    }
    
    const currentText = this.getPlainText();
    const currentWords = this.countWords(currentText);
    const remainingWords = this.maxWords - currentWords;
    const textWords = this.countWords(processedText);
    
    if (textWords > remainingWords) {
      const wordsArray = processedText.split(/\s+/);
      const textToInsert = wordsArray.slice(0, remainingWords).join(' ');
      document.execCommand('insertText', false, textToInsert);
    } else {
      document.execCommand('insertText', false, processedText);
    }
    
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  convertWordToTamil(word) {
    const lower = word.toLowerCase();
    
    if (this.tamilDict[lower]) {
      return this.tamilDict[lower];
    }
    
    if (typeof transliterateToTamil === 'function') {
      return transliterateToTamil(word);
    }
    
    return null;
  }
  
  convertEnglishToTamil(text) {
    const words = text.split(/(\s+)/);
    return words.map(word => {
      if (/^[a-zA-Z]+$/.test(word)) {
        const converted = this.convertWordToTamil(word);
        return converted || word;
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
      const wordsArray = text.split(/\s+/);
      const truncated = wordsArray.slice(0, this.maxWords).join(' ');
      this.editor.textContent = truncated;
      this.moveCursorToEnd();
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
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    
    const text = this.getPlainText();
    
    if (!text || text.length < 5) {
      this.clearSuggestions();
      return;
    }
    
    if (text === this.lastAnalyzedText) {
      return;
    }
    
    this.analysisTimeout = setTimeout(() => {
      this.runAutoAnalysis();
    }, 2000);
  }
  
  async runAutoAnalysis() {
    if (this.isAnalyzing) {
      this.pendingAnalysis = true;
      return;
    }
    
    const text = this.getPlainText();
    
    if (!text || text.length < 5) {
      return;
    }
    
    if (text === this.lastAnalyzedText) {
      return;
    }
    
    this.isAnalyzing = true;
    this.lastAnalyzedText = text;
    
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    
    try {
      const response = await fetch('/api/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: this.abortController.signal
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.suggestions) {
          this.displaySuggestions(data.suggestions);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[HomeEditor] Analysis error:', err);
      }
    } finally {
      this.isAnalyzing = false;
      
      if (this.pendingAnalysis) {
        this.pendingAnalysis = false;
        this.scheduleAutoAnalysis();
      }
    }
  }
  
  displaySuggestions(suggestions) {
    if (!this.suggestionsContainer) return;
    
    if (!suggestions || suggestions.length === 0) {
      this.clearSuggestions();
      return;
    }
    
    this.suggestionsContainer.innerHTML = suggestions.map((s, idx) => `
      <div class="p-3 bg-white rounded-lg shadow-sm border border-orange-100 hover:border-orange-300 transition cursor-pointer" 
           onclick="homeEditor.applySuggestion(${idx})">
        <div class="flex items-start gap-2">
          <span class="text-orange-500 font-bold">${idx + 1}.</span>
          <div>
            <span class="line-through text-red-400">${s.original || ''}</span>
            <span class="mx-2">→</span>
            <span class="text-green-600 font-medium">${s.correction || ''}</span>
            ${s.description ? `<p class="text-sm text-gray-500 mt-1">${s.description}</p>` : ''}
          </div>
        </div>
      </div>
    `).join('');
    
    this.currentAnalysisSuggestions = suggestions;
  }
  
  applySuggestion(index) {
    if (!this.currentAnalysisSuggestions || !this.currentAnalysisSuggestions[index]) return;
    
    const suggestion = this.currentAnalysisSuggestions[index];
    const text = this.editor.textContent || '';
    
    if (suggestion.original && suggestion.correction) {
      const newText = text.replace(suggestion.original, suggestion.correction);
      this.editor.textContent = newText;
      this.updateWordCount();
      this.scheduleAutoAnalysis();
    }
  }
  
  clearSuggestions() {
    if (this.suggestionsContainer) {
      this.suggestionsContainer.innerHTML = `
        <div class="text-center text-gray-400 py-8">
          <p>AI suggestions will appear here</p>
        </div>
      `;
    }
    this.currentAnalysisSuggestions = [];
  }
}

let homeEditor;
document.addEventListener('DOMContentLoaded', () => {
  const editorEl = document.getElementById('home-editor');
  if (editorEl) {
    homeEditor = new HomeEditor();
    window.homeEditor = homeEditor;
  }
});
