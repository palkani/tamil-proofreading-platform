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

    // Handle paste events
    this.editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
      // Explicitly trigger content change for paste events
      this.onContentChange();
    });
  }

  setupToolbar() {
    const toolbarButtons = document.querySelectorAll('.editor-btn');
    toolbarButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.getAttribute('data-command');
        this.executeCommand(command);
      });
    });
  }

  executeCommand(command) {
    document.execCommand(command, false, null);
    this.editor.focus();
  }

  setupAutocomplete() {
    let autocompleteBox = null;
    this.savedCursorPos = null; // Store cursor position for autocomplete
    
    this.editor.addEventListener('keyup', (e) => {
      if (e.key === 'Escape' && autocompleteBox) {
        autocompleteBox.remove();
        autocompleteBox = null;
        return;
      }

      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      const textBeforeCursor = range.startContainer.textContent.substring(0, range.startOffset);
      const words = textBeforeCursor.split(/\s/);
      const currentWord = words[words.length - 1];

      let suggestions = [];

      // Check if typing in Tamil (2+ characters)
      if (currentWord && currentWord.length >= 2 && /[\u0B80-\u0BFF]/.test(currentWord)) {
        suggestions = getAutocompleteSuggestions(currentWord);
      } 
      // Check if typing in English (2+ characters) - transliterate to Tamil
      else if (currentWord && currentWord.length >= 2 && /^[a-zA-Z]+$/.test(currentWord)) {
        suggestions = getTamilSuggestionsFromEnglish(currentWord, tamilDictionary);
      }
      
      if (suggestions.length > 0) {
        // Save cursor position before showing autocomplete
        this.savedCursorPos = this.getCursorPosition();
        this.showAutocomplete(suggestions, currentWord);
      } else if (autocompleteBox) {
        autocompleteBox.remove();
        autocompleteBox = null;
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
