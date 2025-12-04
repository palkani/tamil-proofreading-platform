class TamilEditor {
  constructor(editorElement) {
    this.editor = editorElement;
    this.maxWords = 2000;
    this.translitHelper = null;
    this.autocompleteDropdown = null;
    
    this.setupEditor();
    this.setupToolbar();
    this.initTransliterationHelper();
  }
  
  countWords(text) {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }
  
  enforceWordLimit() {
    const text = this.editor.textContent;
    const wordCount = this.countWords(text);
    
    if (wordCount > this.maxWords) {
      const wordsArray = text.split(/\s+/);
      const truncated = wordsArray.slice(0, this.maxWords).join(' ');
      this.editor.textContent = truncated;
      this.moveCursorToEnd();
    }
  }

  setupEditor() {
    this.editor.addEventListener('focus', () => {
      if (this.editor.textContent.trim() === '') {
        this.editor.innerHTML = '';
      }
    });

    this.editor.addEventListener('blur', () => {
      if (this.editor.textContent.trim() === '') {
        this.editor.setAttribute('placeholder', 'தமிழில் எழுதத் தொடங்குங்கள்...');
      }
    });

    this.editor.addEventListener('input', () => {
      this.enforceWordLimit();
      this.onContentChange();
      
      if (this.translitHelper) {
        this.translitHelper.triggerAutocomplete();
      }
    });

    this.editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      
      const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
      
      if (englishRatio > 0.5) {
        const tamilText = this.convertEnglishParagraphToTamil(text);
        document.execCommand('insertText', false, tamilText);
      } else {
        document.execCommand('insertText', false, text);
      }
      
      this.onContentChange();
    });
    
    this.editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }
  
  handleKeyDown(e) {
    if (this.translitHelper && this.translitHelper.isVisible) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
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
    
    if (e.key === ' ') {
      if (this.translitHelper && this.translitHelper.isVisible) {
        this.translitHelper.hide();
      }
      
      const handled = this.handleSpaceConversion(e);
      if (handled) {
        e.preventDefault();
      }
    }
  }
  
  handleSpaceConversion(e) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    
    let currentWord = '';
    let wordStart = 0;
    let caretOffset = 0;
    let textNode = null;
    
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      textNode = range.startContainer;
      const text = textNode.textContent || '';
      caretOffset = range.startOffset;
      
      wordStart = caretOffset;
      while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
        wordStart--;
      }
      currentWord = text.substring(wordStart, caretOffset);
    } else {
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(this.editor);
      preCaretRange.setEnd(range.startContainer, range.startOffset);
      const textBefore = preCaretRange.toString();
      
      wordStart = textBefore.length;
      while (wordStart > 0 && !/\s/.test(textBefore[wordStart - 1])) {
        wordStart--;
      }
      currentWord = textBefore.substring(wordStart);
      caretOffset = textBefore.length;
    }
    
    if (!currentWord || !/^[a-zA-Z]+$/.test(currentWord)) {
      return false;
    }
    
    const tamilWord = this.convertWordToTamil(currentWord);
    
    if (tamilWord && tamilWord !== currentWord) {
      this.replaceWordWithExecCommand(currentWord, tamilWord);
      return true;
    }
    
    if (this.translitHelper && this.translitHelper.cache.has(currentWord)) {
      const suggestions = this.translitHelper.cache.get(currentWord);
      if (suggestions && suggestions.length > 0) {
        this.replaceWordWithExecCommand(currentWord, suggestions[0]);
        return true;
      }
    }
    
    this.fetchAndReplaceWord(currentWord);
    return true;
  }
  
  replaceWordWithExecCommand(englishWord, tamilWord) {
    const selection = window.getSelection();
    if (!selection.rangeCount) {
      this.editor.focus();
      document.execCommand('insertText', false, tamilWord + ' ');
      this.onContentChange();
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
          this.onContentChange();
          return;
        }
      }
      
      document.execCommand('insertText', false, tamilWord + ' ');
      this.onContentChange();
      return;
    }
    
    this.selectTextRange(wordStart, wordStart + englishWord.length);
    document.execCommand('insertText', false, tamilWord + ' ');
    this.onContentChange();
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
  
  async fetchAndReplaceWord(englishWord) {
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
      console.error('[TamilEditor] Fetch error:', err);
    }
    
    document.execCommand('insertText', false, ' ');
    this.onContentChange();
  }
  
  createAutocompleteDropdown() {
    let dropdown = document.getElementById('workspace-translit-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'workspace-translit-dropdown';
      dropdown.className = 'hidden bg-white border-2 border-orange-200 rounded-lg shadow-xl overflow-hidden';
      dropdown.style.cssText = 'min-width: 220px; max-height: 280px; overflow-y: auto;';
      dropdown.innerHTML = '<div class="suggestions-list"></div>';
      document.body.appendChild(dropdown);
    }
    this.autocompleteDropdown = dropdown;
    return dropdown;
  }
  
  initTransliterationHelper() {
    if (typeof TransliterationHelper === 'undefined') {
      console.warn('[TamilEditor] TransliterationHelper not loaded, using fallback autocomplete');
      this.setupFallbackAutocomplete();
      return;
    }
    
    this.createAutocompleteDropdown();
    
    this.translitHelper = new TransliterationHelper({
      debounceMs: 250,
      apiEndpoint: '/api/v1/transliterate',
      maxSuggestions: 6,
      minWordLength: 2
    });
    
    this.translitHelper.attach(
      this.editor,
      this.autocompleteDropdown,
      (tamilWord) => {
        this.onContentChange();
      }
    );
  }
  
  setupFallbackAutocomplete() {
    let autocompleteBox = null;
    let selectedIndex = 0;
    let currentSuggestions = [];
    let currentPartialWord = '';
    this.savedCursorPos = null;
    let autocompleteTimeout = null;
    const AUTOCOMPLETE_DELAY = 300;
    
    const removeAutocomplete = () => {
      if (autocompleteBox) {
        autocompleteBox.remove();
        autocompleteBox = null;
        currentSuggestions = [];
        currentPartialWord = '';
        selectedIndex = 0;
      }
    };
    
    const updateSelection = () => {
      if (!autocompleteBox) return;
      const items = autocompleteBox.querySelectorAll('div.px-4');
      items.forEach((item, idx) => {
        if (idx === selectedIndex) {
          item.style.backgroundColor = '#ea580c';
          item.style.color = '#ffffff';
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          item.style.backgroundColor = '';
          item.style.color = '';
        }
      });
    };
    
    this.editor.addEventListener('keydown', (e) => {
      if (autocompleteBox && currentSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
          updateSelection();
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
          updateSelection();
          return;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const selectedSuggestion = currentSuggestions[selectedIndex];
          if (selectedSuggestion && currentPartialWord) {
            this.insertSuggestion(currentPartialWord, selectedSuggestion);
            removeAutocomplete();
          }
          return;
        }
      }
      
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape') {
        removeAutocomplete();
        if (e.key === 'Escape') return;
      }
    });
    
    this.editor.addEventListener('keyup', (e) => {
      if (['Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
        return;
      }

      if (autocompleteTimeout) clearTimeout(autocompleteTimeout);

      const selection = window.getSelection();
      if (!selection.rangeCount) {
        removeAutocomplete();
        return;
      }

      const range = selection.getRangeAt(0);
      const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || '';
      const words = textBeforeCursor.split(/\s/);
      const currentWord = words[words.length - 1];

      if (!currentWord || currentWord.length < 1) {
        removeAutocomplete();
        return;
      }

      autocompleteTimeout = setTimeout(async () => {
        let suggestions = [];

        if (/[\u0B80-\u0BFF]/.test(currentWord)) {
          try {
            const response = await fetch(`/api/autocomplete?prefix=${encodeURIComponent(currentWord)}&limit=8`);
            if (response.ok) {
              const data = await response.json();
              suggestions = data.suggestions || [];
            }
          } catch (err) {
            console.log('Autocomplete API error:', err);
          }
        } 
        else if (/^[a-zA-Z]+$/.test(currentWord) && currentWord.length >= 2) {
          try {
            const response = await fetch('/api/v1/transliterate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: currentWord })
            });
            if (response.ok) {
              const data = await response.json();
              if (data.suggestions) {
                suggestions = data.suggestions.map(s => typeof s === 'string' ? s : s.word);
              }
            }
          } catch (err) {
            console.log('Transliteration API error:', err);
          }
        }
        
        if (suggestions.length > 0) {
          this.savedCursorPos = this.getCursorPosition();
          currentSuggestions = suggestions;
          currentPartialWord = currentWord;
          selectedIndex = 0;
          this.showAutocomplete(suggestions, currentWord);
          autocompleteBox = document.querySelector('.autocomplete-box');
          updateSelection();
        } else {
          removeAutocomplete();
        }
      }, AUTOCOMPLETE_DELAY);
    });
  }

  setupToolbar() {
    const toolbarButtons = document.querySelectorAll('.toolbar-btn[data-command]');
    toolbarButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.getAttribute('data-command');
        this.executeCommand(command);
        
        if (['bold', 'italic', 'underline', 'strikeThrough'].includes(command)) {
          btn.classList.toggle('active');
        }
      });
    });
    
    const fontSizeSelect = document.getElementById('font-size-select');
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        const size = e.target.value;
        document.execCommand('fontSize', false, '7');
        const fontElements = this.editor.querySelectorAll('font[size="7"]');
        fontElements.forEach(el => {
          el.removeAttribute('size');
          el.style.fontSize = size;
        });
        this.editor.focus();
      });
    }
    
    const alignBtn = document.getElementById('align-dropdown-btn');
    const alignDropdown = document.getElementById('align-dropdown');
    if (alignBtn && alignDropdown) {
      alignBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        alignDropdown.classList.toggle('hidden');
      });
      
      document.addEventListener('click', () => {
        alignDropdown.classList.add('hidden');
      });
      
      const dropdownItems = alignDropdown.querySelectorAll('.dropdown-item');
      dropdownItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const command = item.getAttribute('data-command');
          this.executeCommand(command);
          alignDropdown.classList.add('hidden');
        });
      });
    }
    
    const insertLinkBtn = document.getElementById('insert-link-btn');
    if (insertLinkBtn) {
      insertLinkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = prompt('Enter URL:');
        if (url) {
          document.execCommand('createLink', false, url);
          this.editor.focus();
        }
      });
    }
    
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const searchTerm = prompt('Search in document:');
        if (searchTerm) {
          window.find(searchTerm);
        }
      });
    }
    
    const languageToggle = document.getElementById('language-toggle-btn');
    if (languageToggle) {
      let isTamilMode = true;
      languageToggle.addEventListener('click', (e) => {
        e.preventDefault();
        isTamilMode = !isTamilMode;
        const toggleKnob = languageToggle.querySelector('.toggle-knob');
        if (toggleKnob) {
          if (isTamilMode) {
            toggleKnob.style.transform = 'translateX(0)';
            languageToggle.querySelector('span').textContent = 'தமிழ்';
          } else {
            toggleKnob.style.transform = 'translateX(16px)';
            languageToggle.querySelector('span').textContent = 'English';
          }
        }
      });
    }
  }

  executeCommand(command) {
    document.execCommand(command, false, null);
    this.editor.focus();
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

  getCursorPosition() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;
    
    const range = selection.getRangeAt(0);
    
    let cursorPos = 0;
    const walker = document.createTreeWalker(
      this.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode === range.startContainer) {
        cursorPos += range.startOffset;
        break;
      }
      cursorPos += currentNode.textContent.length;
      currentNode = walker.nextNode();
    }
    
    return cursorPos;
  }

  showAutocomplete(suggestions, partialWord) {
    const existing = document.querySelector('.autocomplete-box');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.className = 'autocomplete-box bg-white border-2 border-orange-200 rounded-lg shadow-xl z-50';
    box.style.cssText = 'position: fixed; max-height: 250px; overflow-y: auto; min-width: 200px;';

    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'px-4 py-3 cursor-pointer tamil-text transition-all duration-150 border-b border-gray-100 last:border-b-0';
      item.textContent = suggestion;
      item.style.fontSize = '1.1rem';
      
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#ea580c';
        item.style.color = '#ffffff';
        item.style.transform = 'translateX(4px)';
      });
      
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = '';
        item.style.color = '';
        item.style.transform = '';
      });
      
      item.addEventListener('click', () => {
        this.insertSuggestion(partialWord, suggestion);
        box.remove();
      });
      
      if (index === 0) {
        item.style.backgroundColor = '#fed7aa';
      }
      
      box.appendChild(item);
    });

    const selection = window.getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      box.style.left = rect.left + 'px';
      box.style.top = (rect.bottom + 5) + 'px';
    }

    document.body.appendChild(box);
  }

  insertSuggestion(partialWord, fullWord) {
    try {
      const fullText = this.editor.textContent || '';
      
      const cursorPos = this.savedCursorPos !== null ? this.savedCursorPos : this.getCursorPosition();
      
      let wordStart = cursorPos;
      while (wordStart > 0 && fullText[wordStart - 1] && !/[\s\n]/.test(fullText[wordStart - 1])) {
        wordStart--;
      }
      
      const before = fullText.substring(0, wordStart);
      const after = fullText.substring(cursorPos);
      const newText = before + fullWord + ' ' + after;
      
      this.editor.textContent = newText;
      
      const newCursorPos = wordStart + fullWord.length + 1;
      
      this.editor.focus();
      
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      
      const newWalker = document.createTreeWalker(
        this.editor,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let textNode = newWalker.nextNode();
      let charCount = 0;
      
      while (textNode) {
        const nextCharCount = charCount + textNode.textContent.length;
        if (newCursorPos <= nextCharCount) {
          const offset = newCursorPos - charCount;
          newRange.setStart(textNode, offset);
          newRange.setEnd(textNode, offset);
          break;
        }
        charCount = nextCharCount;
        textNode = newWalker.nextNode();
      }
      
      newRange.collapse(true);
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      
      this.savedCursorPos = null;
      
      this.onContentChange();
      
    } catch (error) {
      console.error('Error inserting suggestion:', error);
    }
  }

  convertEnglishParagraphToTamil(englishText) {
    const words = englishText.split(/(\s+)/);
    
    return words.map(word => {
      if (/^\s+$/.test(word)) return word;
      
      if (/[a-zA-Z]/.test(word)) {
        const match = word.match(/^([a-zA-Z]+)([\s\S]*)$/);
        if (match) {
          const englishPart = match[1];
          const punctuation = match[2];
          const tamilWord = this.convertWordToTamil(englishPart);
          return (tamilWord || englishPart) + punctuation;
        }
      }
      
      return word;
    }).join('');
  }

  convertWordToTamil(englishWord) {
    if (!englishWord) return '';
    
    if (typeof transliterateToTamil === 'function') {
      return transliterateToTamil(englishWord);
    }
    
    return englishWord;
  }

  setCursorPosition(position) {
    this.editor.focus();
    
    const range = document.createRange();
    const selection = window.getSelection();
    
    const walker = document.createTreeWalker(
      this.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let textNode = walker.nextNode();
    let charCount = 0;
    
    while (textNode) {
      const nextCharCount = charCount + textNode.textContent.length;
      if (position <= nextCharCount) {
        const offset = position - charCount;
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset);
        break;
      }
      charCount = nextCharCount;
      textNode = walker.nextNode();
    }
    
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  getPlainText() {
    return htmlToPlainText(this.editor.innerHTML);
  }

  getHTML() {
    return this.editor.innerHTML;
  }

  setContent(html) {
    this.editor.innerHTML = html || '<p><br></p>';
  }

  setText(text) {
    this.editor.innerHTML = plainTextToHtml(text);
  }

  clear() {
    this.editor.innerHTML = '<p><br></p>';
    this.onContentChange();
  }

  onContentChange() {
    if (this.onChange) {
      this.onChange();
    }
  }

  highlightSpellingMistakes(suggestions) {
    this.clearHighlights();
    
    const spellingMistakes = suggestions.filter(s => s.type === 'spelling');
    
    if (spellingMistakes.length === 0) {
      return;
    }

    const plainText = this.getPlainText();
    
    spellingMistakes.forEach(mistake => {
      const { original } = mistake;
      if (!original) return;
      
      const regex = new RegExp(`\\b${original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let match;
      
      while ((match = regex.exec(plainText)) !== null) {
        this.addHighlight(match.index, match.index + original.length, 'spelling-mistake');
        break;
      }
    });
  }

  addHighlight(start, end, className) {
    const range = document.createRange();
    
    const walker = document.createTreeWalker(
      this.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let textNode = walker.nextNode();
    let charCount = 0;
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;
    
    while (textNode) {
      const nextCharCount = charCount + textNode.textContent.length;
      
      if (start >= charCount && start < nextCharCount && !startNode) {
        startNode = textNode;
        startOffset = start - charCount;
      }
      
      if (end > charCount && end <= nextCharCount) {
        endNode = textNode;
        endOffset = end - charCount;
      }
      
      charCount = nextCharCount;
      textNode = walker.nextNode();
    }
    
    if (startNode && endNode) {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      
      const span = document.createElement('span');
      span.className = `${className} spelling-error-underline`;
      range.surroundContents(span);
    }
  }

  clearHighlights() {
    const highlights = this.editor.querySelectorAll('.spelling-error-underline');
    highlights.forEach(highlight => {
      while (highlight.firstChild) {
        highlight.parentNode.insertBefore(highlight.firstChild, highlight);
      }
      highlight.parentNode.removeChild(highlight);
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TamilEditor;
}
