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
        this.showAutocomplete(suggestions, currentWord);
      } else if (autocompleteBox) {
        autocompleteBox.remove();
        autocompleteBox = null;
      }
    });
  }

  showAutocomplete(suggestions, partialWord) {
    // Remove existing autocomplete
    const existing = document.querySelector('.autocomplete-box');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.className = 'autocomplete-box absolute bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-w-xs';
    box.style.cssText = 'position: fixed; max-height: 200px; overflow-y: auto;';

    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'px-4 py-2 hover:bg-blue-50 cursor-pointer tamil-text';
      item.textContent = suggestion;
      
      item.addEventListener('click', () => {
        this.insertSuggestion(partialWord, suggestion);
        box.remove();
      });
      
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
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    let textNode = range.startContainer;
    
    // If we're in an element node, get the text node
    if (textNode.nodeType === Node.ELEMENT_NODE) {
      // Create a text node if needed
      if (!textNode.firstChild || textNode.firstChild.nodeType !== Node.TEXT_NODE) {
        const newTextNode = document.createTextNode('');
        textNode.appendChild(newTextNode);
        textNode = newTextNode;
      } else {
        textNode = textNode.firstChild;
      }
    }
    
    const text = textNode.textContent || '';
    const cursorPos = range.startOffset;

    // Find the start of the partial word
    let startPos = cursorPos;
    while (startPos > 0 && text[startPos - 1] && !/\s/.test(text[startPos - 1])) {
      startPos--;
    }

    // Replace the partial word with the Tamil word
    const beforeWord = text.substring(0, startPos);
    const afterWord = text.substring(cursorPos);
    const newText = beforeWord + fullWord + ' ' + afterWord;
    
    textNode.textContent = newText;

    // Move cursor to after the inserted word (including the space)
    const newCursorPos = startPos + fullWord.length + 1;
    range.setStart(textNode, newCursorPos);
    range.setEnd(textNode, newCursorPos);
    range.collapse(true);
    
    selection.removeAllRanges();
    selection.addRange(range);

    // Trigger content change
    this.onContentChange();
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
