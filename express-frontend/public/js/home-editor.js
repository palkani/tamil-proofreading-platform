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
    
    // Transliteration autocomplete state
    this.translitTimeout = null;
    this.autocompleteBox = null;
    this.previousText = ''; // Track previous text for space detection
    
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
    console.log('[INIT] HomeEditor init called, editor element:', this.editor ? 'FOUND' : 'NOT FOUND');
    if (!this.editor) {
      console.log('[INIT] ERROR: home-editor element not found! Cannot initialize.');
      return;
    }
    console.log('[INIT] Editor element found, attaching event listeners');
    
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
    this.editor.addEventListener('keydown', (e) => {
      console.log('[EVENT-DEBUG] keydown fired, key:', e.key, 'code:', e.code);
      if (e.key === ' ' || e.code === 'Space' || e.keyCode === 32) {
        console.log('[EVENT-DEBUG] Space key detected in keydown');
        this.handleKeyDown(e);
      }
    });
    this.editor.addEventListener('input', () => this.handleInput());
    this.editor.addEventListener('paste', (e) => this.handlePaste(e));
    
    // Update word count on load
    this.updateWordCount();
  }
  
  formatText(command) {
    document.execCommand(command, false, null);
    this.editor.focus();
  }
  
  handleKeyDown(e) {
    // Detect space key press BEFORE text is inserted
    if (e.key === ' ' || e.code === 'Space') {
      console.log('[KEYDOWN] Space key detected');
      // Get current text before space is inserted
      const fullText = (this.editor.textContent || '').trimEnd();
      const words = fullText.split(/\s+/);
      const lastWord = words[words.length - 1] || '';
      
      console.log('[KEYDOWN] Last word before space:', lastWord);
      
      // Check if we should prevent default and handle transliteration
      if (lastWord && /^[a-zA-Z]+$/.test(lastWord)) {
        // Try local dict first
        const tamilWord = this.convertWordToTamil(lastWord);
        console.log('[KEYDOWN] Local dict result:', tamilWord);
        
        if (tamilWord && tamilWord !== lastWord) {
          // Replace in editor and add space
          e.preventDefault();
          const beforeLastWord = fullText.substring(0, fullText.length - lastWord.length);
          this.editor.textContent = beforeLastWord + tamilWord + ' ';
          this.moveCursorToEnd();
          console.log('[KEYDOWN] Used local translation:', lastWord, '->', tamilWord);
          this.updateWordCount();
          this.scheduleAutoAnalysis();
          return;
        } else {
          // Call API for transliteration
          console.log('[KEYDOWN] Calling API for:', lastWord);
          e.preventDefault();
          const beforeLastWord = fullText.substring(0, fullText.length - lastWord.length);
          this.lastEditedWord = { word: lastWord, before: beforeLastWord };
          this.transliterateFromKeypress(lastWord);
          return;
        }
      }
    }
  }

  handleInput() {
    const fullText = this.editor.textContent || '';
    console.log('[INPUT-HANDLER] Current text length:', fullText.length, 'Previous length:', this.previousText.length);
    
    // Detect if space was just added
    const hasSpaceNow = fullText.length > this.previousText.length && fullText[fullText.length - 1] === ' ';
    
    if (hasSpaceNow) {
      console.log('[INPUT-HANDLER] Space detected! Calling handleSpaceInInput');
      this.handleSpaceInInput();
    } else {
      this.enforceWordLimit();
      this.updateWordCount();
      this.scheduleAutoAnalysis();
    }
    
    this.previousText = fullText; // Update previous text for next comparison
  }
  
  handleSpaceInInput() {
    const fullText = (this.editor.textContent || '').trimEnd();
    const words = fullText.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    
    console.log('[SPACE-INPUT] Space typed after word:', lastWord);
    
    // If last word is English, try translation
    if (lastWord && /^[a-zA-Z]+$/.test(lastWord)) {
      // Try local dict first
      const tamilWord = this.convertWordToTamil(lastWord);
      console.log('[SPACE-INPUT] Local dict result:', tamilWord);
      
      if (tamilWord && tamilWord !== lastWord) {
        // Replace in editor and move cursor to end
        const beforeLastWord = fullText.substring(0, fullText.length - lastWord.length);
        this.editor.textContent = beforeLastWord + tamilWord + ' ';
        this.moveCursorToEnd();
        console.log('[SPACE-INPUT] Used local translation:', lastWord, '->', tamilWord);
        this.updateWordCount();
        this.scheduleAutoAnalysis();
        return;
      } else {
        // Call API
        console.log('[SPACE-INPUT] Calling API for:', lastWord);
        this.transliterateFromInput(lastWord);
        return;
      }
    }
    
    // No transliteration needed, just schedule analysis
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
  
  async transliterateFromInput(englishWord) {
    console.log('[API-INPUT] Transliterating:', englishWord);
    try {
      const response = await fetch('/api/transliterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: englishWord })
      });
      
      console.log('[API-INPUT] Status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[API-INPUT] Response:', data);
        
        if (data.success && data.suggestions?.[0]) {
          const tamilWord = data.suggestions[0];
          const fullText = (this.editor.textContent || '').trimEnd();
          const beforeLastWord = fullText.substring(0, fullText.length - englishWord.length);
          this.editor.textContent = beforeLastWord + tamilWord + ' ';
          this.moveCursorToEnd();
          console.log('[API-INPUT] Inserted Tamil:', englishWord, '->', tamilWord);
          this.updateWordCount();
          this.scheduleAutoAnalysis();
          return;
        } else {
          console.log('[API-INPUT] No suggestions or error:', data.error || 'empty suggestions');
        }
      }
    } catch (err) {
      console.log('[API-INPUT] Error:', err);
    }
    
    // Fallback: just leave the space there and analyze
    this.scheduleAutoAnalysis();
  }
  
  async transliterateFromKeypress(englishWord) {
    console.log('[KEYPRESS] Calling transliteration API for:', englishWord);
    try {
      const response = await fetch('/api/transliterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: englishWord })
      });
      
      console.log('[KEYPRESS] Status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[KEYPRESS] Response:', data);
        
        if (data.success && data.suggestions?.[0]) {
          const tamilWord = data.suggestions[0];
          // Use the stored word info if available, otherwise fallback
          if (this.lastEditedWord) {
            this.editor.textContent = this.lastEditedWord.before + tamilWord + ' ';
          }
          this.moveCursorToEnd();
          console.log('[KEYPRESS] Inserted Tamil:', englishWord, '->', tamilWord);
          this.updateWordCount();
          this.scheduleAutoAnalysis();
          return;
        } else {
          console.log('[KEYPRESS] No suggestions or error:', data.error || 'empty suggestions');
        }
      }
    } catch (err) {
      console.log('[KEYPRESS] Error:', err);
    }
    
    // Fallback: just add space and analyze
    if (this.lastEditedWord) {
      this.editor.textContent = this.lastEditedWord.before + englishWord + ' ';
      this.moveCursorToEnd();
    }
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  handleTransliterationAutocomplete() {
    if (this.translitTimeout) clearTimeout(this.translitTimeout);
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || '';
    const words = textBeforeCursor.split(/\s/);
    const currentWord = words[words.length - 1];
    
    console.log('[TRANSLIT-DEBUG] Current word:', currentWord, 'Length:', currentWord?.length, 'Is English:', /^[a-zA-Z]+$/.test(currentWord || ''));
    
    // Only trigger for English words (2+ chars)
    if (!currentWord || currentWord.length < 2 || !/^[a-zA-Z]+$/.test(currentWord)) {
      this.removeTranslitAutocomplete();
      return;
    }
    
    // Debounce transliteration API call
    this.translitTimeout = setTimeout(async () => {
      console.log('[TRANSLIT-DEBUG] Calling API with word:', currentWord);
      try {
        const response = await fetch('/api/transliterate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: currentWord })
        });
        
        console.log('[TRANSLIT-DEBUG] API response status:', response.status);
        if (response.ok) {
          const data = await response.json();
          console.log('[TRANSLIT-DEBUG] API response data:', data);
          if (data.suggestions && data.suggestions.length > 0) {
            console.log('[TRANSLIT-DEBUG] Showing autocomplete with', data.suggestions.length, 'suggestions');
            this.showTranslitAutocomplete(data.suggestions);
          }
        }
      } catch (err) {
        console.log('[TRANSLIT-DEBUG] Transliteration API error:', err);
      }
    }, 300);
  }
  
  showTranslitAutocomplete(suggestions) {
    this.removeTranslitAutocomplete();
    
    const box = document.createElement('div');
    box.className = 'autocomplete-box bg-white border-2 border-orange-200 rounded-lg shadow-xl z-50';
    box.style.cssText = 'position: fixed; max-height: 200px; overflow-y: auto; min-width: 150px;';
    
    suggestions.slice(0, 5).forEach((word) => {
      const item = document.createElement('div');
      item.className = 'px-3 py-2 cursor-pointer tamil-text hover:bg-orange-100';
      item.textContent = word;
      item.style.fontSize = '1rem';
      
      item.addEventListener('click', () => {
        this.insertTransliteratedWord(word);
        this.removeTranslitAutocomplete();
      });
      
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
    this.autocompleteBox = box;
  }
  
  insertTransliteratedWord(tamilWord) {
    // Use the more reliable approach: select the English word and replace it
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const fullText = this.editor.textContent;
    const textBeforeCursor = fullText.substring(0, range.startOffset);
    
    // Extract current English word
    const words = textBeforeCursor.split(/\s/);
    const currentWord = words[words.length - 1];
    
    // Only replace if it's an English word
    if (!currentWord || !/^[a-zA-Z]+$/.test(currentWord)) {
      return;
    }
    
    // Position range to select the English word backwards
    const wordStartOffset = range.startOffset - currentWord.length;
    
    // Create a new range to select the English word
    const newRange = document.createRange();
    newRange.setStart(range.startContainer, wordStartOffset);
    newRange.setEnd(range.startContainer, range.startOffset);
    
    // Replace the selection with Tamil word using execCommand
    selection.removeAllRanges();
    selection.addRange(newRange);
    document.execCommand('insertText', false, tamilWord);
    
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  removeTranslitAutocomplete() {
    if (this.autocompleteBox) {
      this.autocompleteBox.remove();
      this.autocompleteBox = null;
    }
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
  
  convertWordToTamil(word) {
    const lower = word.toLowerCase();
    
    // First check local dictionary for common words
    if (this.tamilDict[lower]) {
      return this.tamilDict[lower];
    }
    
    // Use global transliteration function if available
    if (typeof transliterateToTamil === 'function') {
      const result = transliterateToTamil(word);
      // Only return if conversion was successful (different from input)
      if (result && result !== lower && result !== word) {
        return result;
      }
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
      
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, save_draft: false }),
        signal: this.abortController.signal
      });
      
      if (!response.ok) {
        throw new Error('Analysis failed');
      }
      
      const data = await response.json();
      console.log('AI analysis response (full):', JSON.stringify(data, null, 2));
      console.log('Response structure check:', {
        hasResult: !!data.result,
        resultType: typeof data.result,
        resultKeys: data.result ? Object.keys(data.result) : 'no result',
        hasCorrections: !!data.corrections,
        hasResultCorrections: !!data.result?.corrections,
      });
      
      // Extract suggestions from API response
      // The API returns suggestions array with properties: original, corrected, reason, type
      // It could be at data.result.suggestions, data.result.corrections, or data.corrections
      let rawSuggestions = [];
      
      if (data.result?.suggestions) {
        rawSuggestions = data.result.suggestions;
      } else if (data.result?.corrections) {
        rawSuggestions = data.result.corrections;
      } else if (Array.isArray(data.result)) {
        rawSuggestions = data.result;
      } else if (data.suggestions) {
        rawSuggestions = data.suggestions;
      } else if (data.corrections) {
        rawSuggestions = data.corrections;
      } else if (data.result && typeof data.result === 'object') {
        rawSuggestions = data.result.suggestions || data.result.corrections || [];
      }
      
      console.log('Extracted rawSuggestions:', rawSuggestions);
      console.log('Suggestions count:', rawSuggestions.length);
      
      // Transform to match displaySuggestions format: original, corrected, reason, type, alternatives
      const suggestions = rawSuggestions.map((item, index) => ({
        id: index,
        original: item.original || item.originalText || '',
        corrected: item.corrected || item.correction || '',
        reason: item.reason || item.description || '',
        type: item.type || 'grammar',
        alternatives: item.alternatives || []
      }));
      
      console.log('Final suggestions to display:', suggestions.length, suggestions);
      this.displaySuggestions(suggestions);
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Auto-analysis error:', error);
        console.error('Error details:', {
          message: error.message,
          status: error.status,
          stack: error.stack
        });
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
    
    const suggestionsHTML = suggestions.map((suggestion, index) => {
      const typeLabel = (suggestion.type || 'grammar').toUpperCase();
      const hasCorrection = suggestion.original && suggestion.corrected;
      const hasAlternatives = suggestion.alternatives && Array.isArray(suggestion.alternatives) && suggestion.alternatives.length > 0;
      
      return `
        <div class="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500 mb-3">
          <div class="flex items-start gap-2">
            <span class="inline-block px-2 py-1 bg-orange-600 text-white text-xs rounded font-semibold flex-shrink-0 whitespace-nowrap">
              ${typeLabel}
            </span>
            <div class="flex-1 min-w-0">
              ${hasCorrection ? `
                <p class="text-sm text-gray-700 mb-2">
                  <span class="line-through text-red-600">"${suggestion.original}"</span>
                  <span class="mx-1 text-gray-400">→</span>
                  <span class="text-green-600 font-semibold">"${suggestion.corrected}"</span>
                </p>
              ` : ''}
              ${suggestion.reason ? `
                <p class="text-sm text-gray-700 mb-2">${suggestion.reason}</p>
              ` : ''}
              ${hasAlternatives ? `
                <div class="mt-2 pt-2 border-t border-orange-200">
                  <p class="text-xs font-semibold text-gray-600 mb-1">Alternatives:</p>
                  <div class="space-y-1">
                    ${suggestion.alternatives.map(alt => `
                      <p class="text-xs text-gray-600 pl-2 border-l-2 border-orange-300">
                        "${alt}"
                      </p>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
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
