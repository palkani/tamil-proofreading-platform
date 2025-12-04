class TransliterationHelper {
  constructor(options = {}) {
    this.debounceMs = options.debounceMs || 200;
    this.apiEndpoint = options.apiEndpoint || '/api/v1/transliterate';
    this.maxSuggestions = options.maxSuggestions || 5;
    this.minWordLength = options.minWordLength || 2;
    
    this.cache = new Map();
    this.cacheMaxSize = 100;
    this.debounceTimer = null;
    this.latestReqId = 0;
    this.currentSuggestions = [];
    this.selectedIndex = 0;
    this.isVisible = false;
    this.currentWord = '';
    this.wordStartOffset = 0;
    
    this.dropdownElement = null;
    this.editorElement = null;
    this.onSelect = null;
  }

  attach(editorElement, dropdownElement, onSelectCallback) {
    this.editorElement = editorElement;
    this.dropdownElement = dropdownElement;
    this.onSelect = onSelectCallback;
    
    this.setupKeyboardHandlers();
    this.setupClickHandler();
  }

  setupKeyboardHandlers() {
    if (!this.editorElement) return;
    
    this.editorElement.addEventListener('keydown', (e) => {
      if (!this.isVisible) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.moveSelection(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.moveSelection(-1);
          break;
        case 'Enter':
          if (this.currentSuggestions.length > 0) {
            e.preventDefault();
            this.selectCurrent();
          }
          break;
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
        case ' ':
          this.hide();
          break;
      }
    });
  }

  setupClickHandler() {
    document.addEventListener('click', (e) => {
      if (this.dropdownElement && !this.dropdownElement.contains(e.target) && 
          this.editorElement && !this.editorElement.contains(e.target)) {
        this.hide();
      }
    });
  }

  getCaretInfo() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    
    const range = selection.getRangeAt(0);
    if (!this.editorElement.contains(range.startContainer)) return null;
    
    let textNode = range.startContainer;
    let caretOffset = range.startOffset;
    
    if (textNode.nodeType !== Node.TEXT_NODE) {
      const textBefore = this.getTextBeforeCaret(range);
      if (!textBefore) {
        return { word: '', wordStart: 0, caretOffset: 0, textNode: null, fullText: '' };
      }
      
      let wordStart = textBefore.length;
      while (wordStart > 0 && !/\s/.test(textBefore[wordStart - 1])) {
        wordStart--;
      }
      
      const word = textBefore.substring(wordStart);
      
      return {
        word,
        wordStart,
        caretOffset: textBefore.length,
        textNode: null,
        fullText: textBefore,
        useExecCommand: true
      };
    }
    
    const text = textNode.textContent || '';
    
    let wordStart = caretOffset;
    while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
      wordStart--;
    }
    
    const word = text.substring(wordStart, caretOffset);
    
    return {
      word,
      wordStart,
      caretOffset,
      textNode,
      fullText: text
    };
  }
  
  getTextBeforeCaret(range) {
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(this.editorElement);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    return preCaretRange.toString();
  }

  isEnglishWord(word) {
    return word && word.length >= this.minWordLength && /^[a-zA-Z]+$/.test(word);
  }

  async fetchSuggestions(word) {
    if (this.cache.has(word)) {
      const reqId = ++this.latestReqId;
      return { suggestions: this.cache.get(word), reqId, fromCache: true };
    }
    
    const reqId = ++this.latestReqId;
    
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: word })
      });
      
      if (!response.ok) {
        return { suggestions: [], reqId, fromCache: false };
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.suggestions)) {
        const suggestions = data.suggestions
          .slice(0, this.maxSuggestions)
          .map(s => typeof s === 'string' ? s : s.word);
        
        this.addToCache(word, suggestions);
        return { suggestions, reqId, fromCache: false };
      }
      
      return { suggestions: [], reqId, fromCache: false };
    } catch (err) {
      console.error('[TranslitHelper] Fetch error:', err);
      return { suggestions: [], reqId, fromCache: false };
    }
  }

  addToCache(word, suggestions) {
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(word, suggestions);
  }

  triggerAutocomplete() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.doAutocomplete();
    }, this.debounceMs);
  }

  async doAutocomplete() {
    const caretInfo = this.getCaretInfo();
    
    if (!caretInfo || !this.isEnglishWord(caretInfo.word)) {
      this.hide();
      return;
    }
    
    this.currentWord = caretInfo.word;
    this.wordStartOffset = caretInfo.wordStart;
    this.savedCaretInfo = caretInfo;
    
    const { suggestions, reqId, fromCache } = await this.fetchSuggestions(caretInfo.word);
    
    if (!fromCache && reqId < this.latestReqId) {
      return;
    }
    
    const freshCaretInfo = this.getCaretInfo();
    if (freshCaretInfo && freshCaretInfo.word === caretInfo.word) {
      this.savedCaretInfo = freshCaretInfo;
    }
    
    if (suggestions.length > 0) {
      this.currentSuggestions = suggestions;
      this.selectedIndex = 0;
      this.show();
    } else {
      this.hide();
    }
  }

  show() {
    if (!this.dropdownElement) return;
    
    this.renderSuggestions();
    this.positionDropdown();
    this.dropdownElement.classList.remove('hidden');
    this.isVisible = true;
  }

  hide() {
    if (!this.dropdownElement) return;
    
    this.dropdownElement.classList.add('hidden');
    this.isVisible = false;
    this.currentSuggestions = [];
    this.selectedIndex = 0;
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  renderSuggestions() {
    if (!this.dropdownElement) return;
    
    const container = this.dropdownElement.querySelector('.suggestions-list') || this.dropdownElement;
    
    container.innerHTML = this.currentSuggestions.map((suggestion, idx) => `
      <div class="suggestion-item p-3 cursor-pointer transition-colors duration-150 border-b border-gray-100 last:border-b-0 flex items-center gap-3 ${idx === this.selectedIndex ? 'bg-orange-100 text-orange-800' : 'hover:bg-gray-50'}"
           data-index="${idx}">
        <span class="suggestion-number w-6 h-6 flex items-center justify-center rounded text-sm font-medium ${idx === this.selectedIndex ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'}">${idx + 1}</span>
        <span class="suggestion-text text-lg">${suggestion}</span>
      </div>
    `).join('');
    
    container.querySelectorAll('.suggestion-item').forEach((item, idx) => {
      item.addEventListener('click', () => {
        this.selectedIndex = idx;
        this.selectCurrent();
      });
      
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = idx;
        this.updateSelectionUI();
      });
    });
  }

  updateSelectionUI() {
    if (!this.dropdownElement) return;
    
    const items = this.dropdownElement.querySelectorAll('.suggestion-item');
    items.forEach((item, idx) => {
      const numberSpan = item.querySelector('.suggestion-number');
      
      if (idx === this.selectedIndex) {
        item.classList.add('bg-orange-100', 'text-orange-800');
        item.classList.remove('hover:bg-gray-50');
        if (numberSpan) {
          numberSpan.classList.add('bg-orange-500', 'text-white');
          numberSpan.classList.remove('bg-gray-200', 'text-gray-600');
        }
      } else {
        item.classList.remove('bg-orange-100', 'text-orange-800');
        item.classList.add('hover:bg-gray-50');
        if (numberSpan) {
          numberSpan.classList.remove('bg-orange-500', 'text-white');
          numberSpan.classList.add('bg-gray-200', 'text-gray-600');
        }
      }
    });
    
    const selectedItem = items[this.selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  positionDropdown() {
    if (!this.dropdownElement) return;
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    const editorRect = this.editorElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 250;
    
    let top = rect.bottom + 5;
    if (top + dropdownHeight > viewportHeight) {
      top = rect.top - dropdownHeight - 5;
    }
    
    this.dropdownElement.style.position = 'fixed';
    this.dropdownElement.style.left = `${Math.max(rect.left, editorRect.left)}px`;
    this.dropdownElement.style.top = `${top}px`;
    this.dropdownElement.style.zIndex = '9999';
  }

  moveSelection(delta) {
    if (this.currentSuggestions.length === 0) return;
    
    this.selectedIndex = (this.selectedIndex + delta + this.currentSuggestions.length) % this.currentSuggestions.length;
    this.updateSelectionUI();
  }

  selectCurrent() {
    if (this.currentSuggestions.length === 0 || this.selectedIndex < 0) return;
    
    const selectedWord = this.currentSuggestions[this.selectedIndex];
    this.insertWord(selectedWord);
    this.hide();
  }

  selectByIndex(index) {
    if (index >= 0 && index < this.currentSuggestions.length) {
      this.selectedIndex = index;
      this.selectCurrent();
    }
  }

  insertWord(tamilWord) {
    if (!this.savedCaretInfo || !this.editorElement) return;
    
    const { textNode, wordStart, caretOffset, fullText, useExecCommand, word } = this.savedCaretInfo;
    
    if (useExecCommand || !textNode || textNode.nodeType !== Node.TEXT_NODE) {
      this.insertWordWithExecCommand(tamilWord, word || this.currentWord);
      return;
    }
    
    try {
      const before = fullText.substring(0, wordStart);
      const after = fullText.substring(caretOffset);
      const newText = before + tamilWord + ' ' + after;
      
      textNode.textContent = newText;
      
      const newCaretPos = wordStart + tamilWord.length + 1;
      const range = document.createRange();
      const selection = window.getSelection();
      
      range.setStart(textNode, Math.min(newCaretPos, newText.length));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      
      if (this.onSelect) {
        this.onSelect(tamilWord);
      }
    } catch (err) {
      console.error('[TranslitHelper] Insert error:', err);
      this.insertWordWithExecCommand(tamilWord, word || this.currentWord);
    }
  }
  
  insertWordWithExecCommand(tamilWord, englishWord) {
    if (!this.editorElement || !englishWord) {
      this.insertWordFallback(tamilWord);
      return;
    }
    
    try {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      
      const searchRange = document.createRange();
      searchRange.selectNodeContents(this.editorElement);
      searchRange.setEnd(range.startContainer, range.startOffset);
      const textBefore = searchRange.toString();
      
      const wordStart = textBefore.lastIndexOf(englishWord);
      if (wordStart === -1) {
        this.insertWordFallback(tamilWord);
        return;
      }
      
      this.selectTextRange(wordStart, wordStart + englishWord.length);
      
      document.execCommand('insertText', false, tamilWord + ' ');
      
      if (this.onSelect) {
        this.onSelect(tamilWord);
      }
    } catch (err) {
      console.error('[TranslitHelper] ExecCommand insert error:', err);
      this.insertWordFallback(tamilWord);
    }
  }
  
  selectTextRange(start, end) {
    const walker = document.createTreeWalker(
      this.editorElement,
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

  insertWordFallback(tamilWord) {
    const fullText = this.editorElement.textContent || '';
    const words = fullText.trimEnd().split(/\s+/);
    
    if (words.length > 0) {
      words[words.length - 1] = tamilWord;
    }
    
    this.editorElement.textContent = words.join(' ') + ' ';
    
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(this.editorElement);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    
    if (this.onSelect) {
      this.onSelect(tamilWord);
    }
  }

  async handleSpaceConversion() {
    const caretInfo = this.getCaretInfo();
    
    if (!caretInfo || !this.isEnglishWord(caretInfo.word)) {
      return false;
    }
    
    const word = caretInfo.word;
    
    if (typeof transliterateToTamil === 'function') {
      const localResult = transliterateToTamil(word);
      if (localResult && localResult !== word) {
        this.savedCaretInfo = caretInfo;
        this.insertWord(localResult);
        return true;
      }
    }
    
    if (this.cache.has(word)) {
      const suggestions = this.cache.get(word);
      if (suggestions.length > 0) {
        this.savedCaretInfo = caretInfo;
        this.insertWord(suggestions[0]);
        return true;
      }
    }
    
    try {
      const { suggestions } = await this.fetchSuggestions(word);
      if (suggestions.length > 0) {
        this.savedCaretInfo = caretInfo;
        this.insertWord(suggestions[0]);
        return true;
      }
    } catch (err) {
      console.error('[TranslitHelper] Space conversion error:', err);
    }
    
    return false;
  }

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.cache.clear();
    this.hide();
  }
}

if (typeof window !== 'undefined') {
  window.TransliterationHelper = TransliterationHelper;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TransliterationHelper;
}
