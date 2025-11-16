// Main Workspace Controller

class WorkspaceController {
  constructor() {
    this.editor = null;
    this.suggestionsPanel = null;
    this.currentDraft = null;
    this.saveTimeout = null;
    this.loading = false;
    this.currentMode = 'editor'; // 'list' or 'editor'
    this.drafts = [];
    
    // Auto-analysis state
    this.analysisTimeout = null;
    this.abortController = null;
    this.lastAnalyzedText = '';
    this.isAnalyzing = false;
    this.autoAnalysisEnabled = true; // Enable auto-analysis by default

    this.init();
  }

  init() {
    // Check URL for mode parameter
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    
    // Initialize editor
    const editorElement = document.getElementById('editor');
    if (editorElement) {
      this.editor = new TamilEditor(editorElement);
      this.editor.onChange = () => this.handleEditorChange();
    }

    // Initialize suggestions panel
    const container = document.getElementById('suggestions-container');
    const summary = document.getElementById('suggestions-summary');
    const acceptAllBtn = document.getElementById('accept-all-btn');
    
    if (container && summary && acceptAllBtn) {
      this.suggestionsPanel = new SuggestionsPanel(container, summary, acceptAllBtn);
      this.suggestionsPanel.onAcceptSuggestion = () => this.handleSuggestionAccepted();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Update status displays
    this.updateWordCount();
    this.updateAcceptedCount();
    
    // Load drafts and set initial mode
    if (mode === 'list') {
      this.showDraftsList();
    } else {
      this.showEditor();
    }
  }

  setupEventListeners() {
    // Check with Gemini AI button
    const geminiBtn = document.getElementById('check-gemini-btn');
    if (geminiBtn) {
      geminiBtn.addEventListener('click', () => this.checkWithGemini());
    }

    // Submit for proofreading button
    const submitBtn = document.getElementById('submit-proofreading-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitForProofreading());
    }

    // Accept all button
    const acceptAllBtn = document.getElementById('accept-all-btn');
    if (acceptAllBtn) {
      acceptAllBtn.addEventListener('click', () => this.acceptAllSuggestions());
    }

    // Draft title
    const titleInput = document.getElementById('draft-title');
    if (titleInput) {
      titleInput.addEventListener('input', () => this.scheduleSave());
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // New Draft button
    const newDraftBtn = document.getElementById('new-draft-btn');
    if (newDraftBtn) {
      newDraftBtn.addEventListener('click', () => this.createNewDraft());
    }

    // Create First Draft button
    const createFirstDraftBtn = document.getElementById('create-first-draft-btn');
    if (createFirstDraftBtn) {
      createFirstDraftBtn.addEventListener('click', () => this.createNewDraft());
    }
  }

  handleEditorChange() {
    this.updateWordCount();
    this.scheduleSave();
    
    // Trigger auto-analysis
    if (this.autoAnalysisEnabled) {
      this.scheduleAutoAnalysis();
    }
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
    const text = this.editor.getPlainText().trim();
    
    // Skip if text is too short (minimum 5 words or 20 characters)
    const wordCount = countWords(text);
    if (wordCount < 5 || text.length < 20) {
      this.updateAnalysisStatus('');
      return;
    }
    
    // Skip if text hasn't changed since last analysis
    if (text === this.lastAnalyzedText) {
      return;
    }
    
    // Cancel any in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.isAnalyzing = true;
    this.abortController = new AbortController();
    this.updateAnalysisStatus('analyzing');
    
    try {
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
        signal: this.abortController.signal
      });
      
      if (!response.ok) {
        throw new Error('Failed to analyze text');
      }
      
      const data = await response.json();
      this.lastAnalyzedText = text;
      
      const geminiSuggestions = (data.suggestions || []).map((result, index) => ({
        id: `gemini-${result.id || index}-${Date.now()}`,
        title: result.title || 'Suggestion',
        description: result.description || '',
        type: result.type || 'grammar',
        preview: result.original && result.suggestion 
          ? `${result.original} → ${result.suggestion}` 
          : result.suggestion || result.original || '',
        sourceText: result.original,
        onApply: result.suggestion && result.original ? () => {
          const currentText = this.editor.getPlainText();
          const { text: newText, changed } = applyReplacement(currentText, result.original, result.suggestion, result.position?.start);
          
          if (changed) {
            this.editor.setText(newText);
          }
        } : null,
        onIgnore: () => {
          // Just removes the suggestion
        }
      }));
      
      this.suggestionsPanel.clearSuggestions();
      this.suggestionsPanel.addSuggestions(geminiSuggestions);
      
      if (geminiSuggestions.length === 0) {
        this.updateAnalysisStatus('no-issues');
      } else {
        this.updateAnalysisStatus('complete', geminiSuggestions.length);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request was cancelled, this is normal
        return;
      }
      console.error('Auto-analysis error:', error);
      this.updateAnalysisStatus('error');
    } finally {
      this.isAnalyzing = false;
      this.abortController = null;
    }
  }
  
  updateAnalysisStatus(status, count = 0) {
    const summaryEl = document.getElementById('suggestions-summary');
    if (!summaryEl) return;
    
    switch (status) {
      case 'analyzing':
        summaryEl.innerHTML = `
          <div class="flex items-center gap-2 text-blue-600">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm font-medium">Analyzing with Gemini AI...</span>
          </div>
        `;
        break;
      case 'complete':
        summaryEl.innerHTML = `
          <div class="text-sm text-gray-600">
            Found <strong>${count}</strong> suggestion${count > 1 ? 's' : ''}
          </div>
        `;
        break;
      case 'no-issues':
        summaryEl.innerHTML = `
          <div class="flex items-center gap-2 text-green-600">
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <span class="text-sm font-medium">No issues found</span>
          </div>
        `;
        break;
      case 'error':
        summaryEl.innerHTML = `
          <div class="text-sm text-red-600">
            Analysis failed. Click "Check with Gemini AI" to retry.
          </div>
        `;
        break;
      default:
        summaryEl.innerHTML = `
          <div class="text-sm text-gray-500">
            Type or paste Tamil text to get AI suggestions
          </div>
        `;
    }
  }

  handleSuggestionAccepted() {
    this.updateAcceptedCount();
  }

  updateWordCount() {
    const text = this.editor.getPlainText();
    const count = countWords(text);
    const wordCountEl = document.getElementById('word-count');
    if (wordCountEl) {
      wordCountEl.textContent = `Words: ${count}`;
    }
  }

  updateAcceptedCount() {
    const count = this.suggestionsPanel.getAcceptedCount();
    const acceptedCountEl = document.getElementById('accepted-count');
    if (acceptedCountEl) {
      acceptedCountEl.textContent = `Accepted: ${count}`;
    }
  }

  scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.autosave();
    }, 2000);
  }

  async autosave() {
    const text = this.editor.getPlainText().trim();
    
    // Don't save empty drafts
    if (!text || text.length < 5) {
      return;
    }
    
    const saveStatusEl = document.getElementById('save-status');
    const autosaveTimeEl = document.getElementById('autosave-time');
    
    if (saveStatusEl) {
      saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-gray-400 rounded-full mr-2"></span>Saving...';
    }

    try {
      const html = this.editor.getHTML();
      
      // If we have a current draft, we're updating it
      // Otherwise, create a new one
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          html: html,
          model: 'gemini-flash' // Default model
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save draft');
      }

      const data = await response.json();
      
      // Update current draft with the saved submission
      if (data.submission) {
        this.currentDraft = data.submission;
        
        // Update title if it's still "Untitled Draft"
        const titleInput = document.getElementById('draft-title');
        if (titleInput && titleInput.value === 'Untitled Draft') {
          titleInput.value = `Draft #${data.submission.id}`;
        }
      }
      
      if (saveStatusEl) {
        saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>Saved';
      }
      if (autosaveTimeEl) {
        const now = new Date();
        autosaveTimeEl.textContent = `Last saved: ${now.toLocaleTimeString()}`;
      }
    } catch (error) {
      console.error('Autosave error:', error);
      if (saveStatusEl) {
        saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>Save failed';
      }
    }
  }

  async checkWithGemini() {
    if (this.loading) return;

    const text = this.editor.getPlainText();
    if (!text || text.trim().length === 0) {
      this.showNotification('Please enter some text first', 'warning');
      return;
    }

    this.loading = true;
    const geminiBtn = document.getElementById('check-gemini-btn');
    const originalText = geminiBtn ? geminiBtn.textContent : '';
    
    if (geminiBtn) {
      geminiBtn.disabled = true;
      geminiBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Analyzing...
      `;
    }

    try {
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze text');
      }

      const data = await response.json();
      const geminiSuggestions = (data.suggestions || []).map((result, index) => ({
        id: `gemini-${result.id || index}-${Date.now()}`,
        title: result.title || 'Suggestion',
        description: result.description || '',
        type: result.type || 'grammar',
        preview: result.original && result.suggestion 
          ? `${result.original} → ${result.suggestion}` 
          : result.suggestion || result.original || '',
        sourceText: result.original,
        onApply: result.suggestion && result.original ? () => {
          const currentText = this.editor.getPlainText();
          const { text: newText, changed } = applyReplacement(currentText, result.original, result.suggestion, result.position?.start);
          
          if (changed) {
            this.editor.setText(newText);
          }
        } : null,
        onIgnore: () => {
          // Just removes the suggestion
        }
      }));

      this.suggestionsPanel.clearSuggestions();
      this.suggestionsPanel.addSuggestions(geminiSuggestions);

      if (geminiSuggestions.length === 0) {
        this.showNotification('Gemini AI found no issues in your Tamil text. Great work!', 'success');
      } else {
        this.showNotification(`Found ${geminiSuggestions.length} suggestion${geminiSuggestions.length > 1 ? 's' : ''}`, 'success');
      }
    } catch (error) {
      console.error('Gemini AI error:', error);
      this.showNotification('Failed to analyze text with Gemini AI. Please try again.', 'error');
    } finally {
      this.loading = false;
      if (geminiBtn) {
        geminiBtn.disabled = false;
        geminiBtn.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          Check with Gemini AI
        `;
      }
    }
  }

  async submitForProofreading() {
    const text = this.editor.getPlainText();
    if (!text || text.trim().length === 0) {
      this.showNotification('Please enter some text first', 'warning');
      return;
    }

    this.showNotification('Submitting to backend for advanced proofreading...', 'info');
    
    // This would call the Go backend API
    // For now, just show a message
    setTimeout(() => {
      this.showNotification('Backend proofreading coming soon!', 'info');
    }, 1000);
  }

  acceptAllSuggestions() {
    // Apply all suggestions with onApply handlers
    const suggestions = [...this.suggestionsPanel.suggestions];
    suggestions.forEach(suggestion => {
      if (suggestion.onApply) {
        suggestion.onApply();
      }
      this.suggestionsPanel.removeSuggestion(suggestion.id);
    });

    this.updateAcceptedCount();
    this.showNotification('All suggestions applied!', 'success');
  }

  logout() {
    if (confirm('Are you sure you want to log out?')) {
      window.location.href = '/';
    }
  }

  showNotification(message, type = 'info') {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 transition-opacity duration-300`;
    
    const bgColors = {
      success: 'bg-green-600',
      error: 'bg-red-600',
      warning: 'bg-yellow-600',
      info: 'bg-blue-600'
    };
    
    toast.classList.add(bgColors[type] || bgColors.info);
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Fade out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  async showDraftsList() {
    this.currentMode = 'list';
    
    // Show list view, hide editor
    const listView = document.getElementById('drafts-list-view');
    const editorPanel = document.querySelector('.flex-1.flex.flex-col.bg-slate-50.border-r');
    const aiPanel = document.querySelector('.w-96.bg-white');
    
    if (listView) listView.classList.remove('hidden');
    if (editorPanel) editorPanel.classList.add('hidden');
    if (aiPanel) aiPanel.classList.add('hidden');
    
    // Load drafts
    await this.loadDrafts();
  }

  showEditor() {
    this.currentMode = 'editor';
    
    // Hide list view, show editor
    const listView = document.getElementById('drafts-list-view');
    const editorPanel = document.querySelector('.flex-1.flex.flex-col.bg-slate-50.border-r');
    const aiPanel = document.querySelector('.w-96.bg-white');
    
    if (listView) listView.classList.add('hidden');
    if (editorPanel) editorPanel.classList.remove('hidden');
    if (aiPanel) aiPanel.classList.remove('hidden');
  }

  async loadDrafts() {
    const loadingEl = document.getElementById('drafts-loading');
    const containerEl = document.getElementById('drafts-container');
    const noDataEl = document.getElementById('no-drafts-message');
    
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (containerEl) containerEl.innerHTML = '';
    if (noDataEl) noDataEl.classList.add('hidden');
    
    try {
      const response = await fetch('/api/submissions?limit=50');
      
      if (!response.ok) {
        throw new Error('Failed to load drafts');
      }
      
      const data = await response.json();
      this.drafts = data.submissions || [];
      
      if (loadingEl) loadingEl.classList.add('hidden');
      
      if (this.drafts.length === 0) {
        if (noDataEl) noDataEl.classList.remove('hidden');
      } else {
        this.renderDrafts();
      }
    } catch (error) {
      console.error('Error loading drafts:', error);
      if (loadingEl) loadingEl.classList.add('hidden');
      this.showNotification('Failed to load drafts', 'error');
    }
  }

  renderDrafts() {
    const container = document.getElementById('drafts-container');
    if (!container) return;
    
    container.innerHTML = this.drafts.map(draft => {
      const date = new Date(draft.created_at);
      const preview = this.getTextPreview(draft.original_text || '');
      const status = this.getStatusBadge(draft.status);
      
      return `
        <div class="bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer p-4" data-draft-id="${draft.id}">
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 mb-1">Draft #${draft.id}</h3>
              <p class="text-sm text-gray-600 line-clamp-2">${preview}</p>
            </div>
            ${status}
          </div>
          <div class="flex items-center gap-4 text-xs text-gray-500 mt-3">
            <span class="flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
              ${draft.word_count || 0} words
            </span>
            <span class="flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              ${this.formatDate(date)}
            </span>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    container.querySelectorAll('[data-draft-id]').forEach(card => {
      card.addEventListener('click', () => {
        const draftId = parseInt(card.dataset.draftId);
        this.openDraft(draftId);
      });
    });
  }

  getTextPreview(text) {
    if (!text) return 'Empty draft';
    return text.length > 150 ? text.substring(0, 150) + '...' : text;
  }

  getStatusBadge(status) {
    const badges = {
      'pending': '<span class="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">Pending</span>',
      'completed': '<span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Completed</span>',
      'processing': '<span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">Processing</span>',
      'failed': '<span class="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">Failed</span>'
    };
    return badges[status] || '';
  }

  formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  }

  async openDraft(draftId) {
    try {
      const response = await fetch(`/api/submissions/${draftId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load draft');
      }
      
      const data = await response.json();
      const draft = data.submission;
      
      // Load draft into editor
      this.currentDraft = draft;
      this.editor.setText(draft.original_text || '');
      
      // Update title
      const titleInput = document.getElementById('draft-title');
      if (titleInput) {
        titleInput.value = `Draft #${draft.id}`;
      }
      
      // Switch to editor view
      this.showEditor();
      
      // Update URL without page reload
      window.history.pushState({}, '', '/workspace');
      
      this.showNotification('Draft loaded successfully', 'success');
    } catch (error) {
      console.error('Error loading draft:', error);
      this.showNotification('Failed to load draft', 'error');
    }
  }

  createNewDraft() {
    // Clear editor
    this.currentDraft = null;
    this.editor.clear();
    this.suggestionsPanel.clearSuggestions();
    
    // Reset title
    const titleInput = document.getElementById('draft-title');
    if (titleInput) {
      titleInput.value = 'Untitled Draft';
    }
    
    // Switch to editor view
    this.showEditor();
    
    // Update URL
    window.history.pushState({}, '', '/workspace');
  }
}

// Initialize workspace when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new WorkspaceController();
  });
} else {
  new WorkspaceController();
}
