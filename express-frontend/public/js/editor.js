// Rich Text Editor with Tamil Support

class TamilEditor {
  constructor(editorElement) {
    this.editor = editorElement;
    this.setupEditor();
    this.setupToolbar();
    this.setupAutocomplete();
  }

  setupEditor() {
    // Set up placeholder behavior
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

    // Track content changes
    this.editor.addEventListener('input', () => {
      this.onContentChange();
    });

    // Handle paste events - Convert English to Tamil
    this.editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      
      // Check if text contains mostly English characters
      const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
      
      if (englishRatio > 0.5) {
        // Text is mostly English, convert to Tamil
        const tamilText = this.convertEnglishParagraphToTamil(text);
        document.execCommand('insertText', false, tamilText);
        console.log('Converted English to Tamil:', { original: text, converted: tamilText });
      } else {
        // Keep as is (already Tamil or mixed)
        document.execCommand('insertText', false, text);
      }
      
      // Explicitly trigger content change for paste events
      this.onContentChange();
    });
  }

  setupToolbar() {
    // All toolbar buttons
    const toolbarButtons = document.querySelectorAll('.toolbar-btn[data-command]');
    toolbarButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.getAttribute('data-command');
        this.executeCommand(command);
        
        // Toggle active state for formatting buttons
        if (['bold', 'italic', 'underline', 'strikeThrough'].includes(command)) {
          btn.classList.toggle('active');
        }
      });
    });
    
    // Font size selector
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
    
    // Alignment dropdown
    const alignBtn = document.getElementById('align-dropdown-btn');
    const alignDropdown = document.getElementById('align-dropdown');
    if (alignBtn && alignDropdown) {
      alignBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        alignDropdown.classList.toggle('hidden');
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        alignDropdown.classList.add('hidden');
      });
      
      // Dropdown items
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
    
    // Insert link button
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
    
    // Search button (placeholder functionality)
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
    
    // Language toggle (placeholder - can be extended for actual Tamil/English switching)
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

  setupAutocomplete() {
    let autocompleteBox = null;
    let selectedIndex = 0; // Track selected autocomplete item
    let currentSuggestions = []; // Store current suggestions
    let currentPartialWord = ''; // Store current partial word being typed
    this.savedCursorPos = null; // Store cursor position for autocomplete
    this.currentEnglishWord = ''; // Track current English word for Google-style typing
    
    // Helper to remove autocomplete
    const removeAutocomplete = () => {
      if (autocompleteBox) {
        autocompleteBox.remove();
        autocompleteBox = null;
        currentSuggestions = [];
        currentPartialWord = '';
        selectedIndex = 0;
      }
    };
    
    // Helper to update selected item highlighting
    const updateSelection = () => {
      if (!autocompleteBox) return;
      const items = autocompleteBox.querySelectorAll('div.px-4');
      items.forEach((item, idx) => {
        if (idx === selectedIndex) {
          item.style.backgroundColor = '#3b82f6'; // Blue-500
          item.style.color = '#ffffff';
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          item.style.backgroundColor = '';
          item.style.color = '';
        }
      });
    };
    
    // Google-style typing: Convert on Space key
    this.editor.addEventListener('keydown', (e) => {
      // Handle autocomplete keyboard navigation
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
          // Insert the selected suggestion
          const selectedSuggestion = currentSuggestions[selectedIndex];
          if (selectedSuggestion && currentPartialWord) {
            this.insertSuggestion(currentPartialWord, selectedSuggestion);
            removeAutocomplete();
          }
          return;
        }
      }
      
      // Hide autocomplete on Backspace, Delete, or Escape
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape') {
        removeAutocomplete();
        if (e.key === 'Escape') return;
      }
      
      if (e.key === ' ') {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || '';
        const words = textBeforeCursor.split(/\s/);
        const currentWord = words[words.length - 1];
        
        // If typing English word, convert to Tamil on space
        if (currentWord && /^[a-zA-Z]+$/.test(currentWord)) {
          e.preventDefault();
          
          // Convert to Tamil
          const tamilWord = this.convertWordToTamil(currentWord);
          
          if (tamilWord && tamilWord !== currentWord) {
            // Replace English with Tamil
            const cursorPos = this.getCursorPosition();
            const fullText = this.editor.textContent || '';
            let wordStart = cursorPos;
            while (wordStart > 0 && fullText[wordStart - 1] && !/[\s\n]/.test(fullText[wordStart - 1])) {
              wordStart--;
            }
            
            const before = fullText.substring(0, wordStart);
            const after = fullText.substring(cursorPos);
            this.editor.textContent = before + tamilWord + ' ' + after;
            
            // Set cursor after the Tamil word and space
            this.setCursorPosition(wordStart + tamilWord.length + 1);
            this.onContentChange();
            
            // Close autocomplete
            removeAutocomplete();
          } else {
            // No Tamil conversion, just add space normally
            document.execCommand('insertText', false, ' ');
            removeAutocomplete();
          }
        }
      }
    });
    
    this.editor.addEventListener('keyup', (e) => {
      // Skip for special keys and Enter (to prevent reopening autocomplete after selection)
      if (['Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection.rangeCount) {
        removeAutocomplete();
        return;
      }

      const range = selection.getRangeAt(0);
      const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || '';
      const words = textBeforeCursor.split(/\s/);
      const currentWord = words[words.length - 1];

      // If word is too short or empty, hide autocomplete
      if (!currentWord || currentWord.length < 2) {
        removeAutocomplete();
        return;
      }

      let suggestions = [];

      // Check if typing in Tamil (2+ characters)
      if (currentWord.length >= 2 && /[\u0B80-\u0BFF]/.test(currentWord)) {
        suggestions = getAutocompleteSuggestions(currentWord);
      } 
      // Check if typing in English (2+ characters) - show Tamil suggestions
      else if (currentWord.length >= 2 && /^[a-zA-Z]+$/.test(currentWord)) {
        suggestions = getTamilSuggestionsFromEnglish(currentWord, tamilDictionary);
      }
      
      if (suggestions.length > 0) {
        // Save cursor position and current state before showing autocomplete
        this.savedCursorPos = this.getCursorPosition();
        currentSuggestions = suggestions;
        currentPartialWord = currentWord;
        selectedIndex = 0; // Reset selection to first item
        this.showAutocomplete(suggestions, currentWord, autocompleteBox);
        autocompleteBox = document.querySelector('.autocomplete-box');
        updateSelection(); // Highlight first item
      } else {
        removeAutocomplete();
      }
    });
  }

  getCursorPosition() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;
    
    const range = selection.getRangeAt(0);
    const fullText = this.editor.textContent || '';
    
    // Calculate actual cursor position in the text
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
    // Remove existing autocomplete
    const existing = document.querySelector('.autocomplete-box');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.className = 'autocomplete-box bg-white border-2 border-blue-200 rounded-lg shadow-xl z-50';
    box.style.cssText = 'position: fixed; max-height: 250px; overflow-y: auto; min-width: 200px;';

    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'px-4 py-3 cursor-pointer tamil-text transition-all duration-150 border-b border-gray-100 last:border-b-0';
      item.textContent = suggestion;
      item.style.fontSize = '1.1rem';
      
      // Add hover effect with theme color
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#3b82f6'; // Blue-500
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
      
      // Auto-select first item
      if (index === 0) {
        item.style.backgroundColor = '#dbeafe'; // Blue-100
      }
      
      box.appendChild(item);
    });

    // Position the autocomplete box near the cursor
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
    console.log('Inserting suggestion:', { partialWord, fullWord });
    
    try {
      // Get the entire text content
      const fullText = this.editor.textContent || '';
      console.log('Full text before:', fullText);
      
      // Use saved cursor position (captured before click)
      const cursorPos = this.savedCursorPos !== null ? this.savedCursorPos : this.getCursorPosition();
      console.log('Cursor position (saved):', cursorPos);
      
      // Find the start of the current word (going backwards from cursor)
      let wordStart = cursorPos;
      while (wordStart > 0 && fullText[wordStart - 1] && !/[\s\n]/.test(fullText[wordStart - 1])) {
        wordStart--;
      }
      
      console.log('Word starts at:', wordStart, 'Word to replace:', fullText.substring(wordStart, cursorPos));
      
      // Build new text with the Tamil word replacing the English word
      const before = fullText.substring(0, wordStart);
      const after = fullText.substring(cursorPos);
      const newText = before + fullWord + ' ' + after;
      
      console.log('New text:', newText);
      
      // Clear and set new content
      this.editor.textContent = newText;
      
      // Set cursor position after the inserted word
      const newCursorPos = wordStart + fullWord.length + 1;
      
      // Focus editor and set cursor position
      this.editor.focus();
      
      // Create new range at the correct position
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      
      // Find the text node and position for the new cursor
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
      
      console.log('Insertion complete');
      
      // Clear saved cursor position
      this.savedCursorPos = null;
      
      // Trigger change event
      this.onContentChange();
      
    } catch (error) {
      console.error('Error inserting suggestion:', error);
    }
  }

  convertEnglishParagraphToTamil(englishText) {
    // Convert an entire English paragraph to Tamil word by word
    const words = englishText.split(/(\s+)/); // Keep whitespace
    
    return words.map(word => {
      // Skip whitespace
      if (/^\s+$/.test(word)) return word;
      
      // Check if word is English
      if (/[a-zA-Z]/.test(word)) {
        // Extract punctuation
        const match = word.match(/^([a-zA-Z]+)([\s\S]*)$/);
        if (match) {
          const englishPart = match[1];
          const punctuation = match[2];
          const tamilWord = this.convertWordToTamil(englishPart);
          return (tamilWord || englishPart) + punctuation;
        }
      }
      
      // Return as is (numbers, Tamil text, punctuation)
      return word;
    }).join('');
  }

  convertWordToTamil(englishWord) {
    if (!englishWord) return '';
    
    // Use transliteration function from transliteration.js
    if (typeof transliterateToTamil === 'function') {
      return transliterateToTamil(englishWord);
    }
    
    // Fallback: return original
    return englishWord;
  }

  setCursorPosition(position) {
    this.editor.focus();
    
    const range = document.createRange();
    const selection = window.getSelection();
    
    // Find the text node and offset for the position
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
    // This will be overridden by the workspace controller
    if (this.onChange) {
      this.onChange();
    }
  }
}

// Make it globally available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TamilEditor;
}
