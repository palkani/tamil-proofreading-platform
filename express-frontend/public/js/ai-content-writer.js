// AI Content Writer - Vanilla JavaScript Implementation
// Converted from React component for Express EJS frontend

(function() {
  'use strict';

  let activeTab = 'generate';
  let currentResult = null;
  let isLoading = false;

  // Initialize
  document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initGenerate();
    initImprove();
    initTranslate();
    initCopyDownload();
  });

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', function() {
        const tabName = this.dataset.tab;
        switchTab(tabName);
      });
    });
  }

  function switchTab(tabName) {
    activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      if (content.id === `${tabName}-tab`) {
        content.style.display = 'block';
        content.classList.add('active');
      } else {
        content.style.display = 'none';
        content.classList.remove('active');
      }
    });

    // Hide previous results
    hideResult();
    hideError();
  }

  function initGenerate() {
    const btn = document.getElementById('generate-btn');
    if (btn) {
      btn.addEventListener('click', handleGenerate);
    }
  }

  async function handleGenerate() {
    const prompt = document.getElementById('prompt-input').value.trim();
    if (!prompt) {
      showError('Please enter a prompt');
      return;
    }

    const language = document.getElementById('language-select').value;
    const contentType = document.getElementById('content-type-select').value;
    const tone = document.getElementById('tone-select').value;
    const wordCount = parseInt(document.getElementById('word-count-select').value);
    const includeTitle = document.getElementById('include-title-checkbox').checked;
    const includeMeta = document.getElementById('include-meta-checkbox').checked;

    setLoading(true);
    hideError();
    hideResult();

    try {
      const response = await fetch('/api/ai-content-writer/generate-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          language,
          content_type: contentType,
          tone,
          word_count: wordCount,
          include_title: includeTitle,
          include_meta: includeMeta
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate content');
      }

      if (data.success) {
        currentResult = data;
        showResult(data, 'generate');
      } else {
        throw new Error(data.error || 'Failed to generate content');
      }
    } catch (error) {
      console.error('Generate error:', error);
      showError(error.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function initImprove() {
    const btn = document.getElementById('improve-btn');
    if (btn) {
      btn.addEventListener('click', handleImprove);
    }
  }

  async function handleImprove() {
    const content = document.getElementById('improve-content-input').value.trim();
    if (!content) {
      showError('Please enter content to improve');
      return;
    }

    const improvementType = document.getElementById('improvement-type-select').value;
    const language = document.getElementById('language-select').value;

    setLoading(true);
    hideError();
    hideResult();

    try {
      const response = await fetch('/api/ai-content-writer/improve-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          improvement_type: improvementType,
          language
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to improve content');
      }

      if (data.success) {
        currentResult = data;
        showResult(data, 'improve');
      } else {
        throw new Error(data.error || 'Failed to improve content');
      }
    } catch (error) {
      console.error('Improve error:', error);
      showError(error.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function initTranslate() {
    const btn = document.getElementById('translate-btn');
    if (btn) {
      btn.addEventListener('click', handleTranslate);
    }
  }

  async function handleTranslate() {
    const content = document.getElementById('translate-content-input').value.trim();
    if (!content) {
      showError('Please enter content to translate');
      return;
    }

    const fromLanguage = document.getElementById('from-language-select').value;
    const toLanguage = document.getElementById('to-language-select').value;

    setLoading(true);
    hideError();
    hideResult();

    try {
      const response = await fetch('/api/ai-content-writer/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          from_language: fromLanguage,
          to_language: toLanguage
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to translate content');
      }

      if (data.success) {
        currentResult = data;
        showResult(data, 'translate');
      } else {
        throw new Error(data.error || 'Failed to translate content');
      }
    } catch (error) {
      console.error('Translate error:', error);
      showError(error.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function showResult(data, type) {
    const resultSection = document.getElementById('result-section');
    const resultContent = document.getElementById('result-content');
    const resultMetadata = document.getElementById('result-metadata');

    if (!resultSection || !resultContent) return;

    // Update title based on type
    const titleEl = document.getElementById('result-title');
    if (titleEl) {
      if (type === 'improve') {
        titleEl.textContent = '✨ Improved Content';
      } else if (type === 'translate') {
        titleEl.textContent = '✨ Translated Content';
      } else {
        titleEl.textContent = '✨ Generated Content';
      }
    }

    let html = '';

    if (type === 'generate' && data.content) {
      // Generate result
      if (data.content.title) {
        html += `
          <div class="content-block">
            <h3 class="content-block-title">Title</h3>
            <div class="content-block-text title-text">${escapeHtml(data.content.title)}</div>
          </div>
        `;
      }

      if (data.content.meta_description) {
        html += `
          <div class="content-block">
            <h3 class="content-block-title">Meta Description</h3>
            <div class="content-block-text">${escapeHtml(data.content.meta_description)}</div>
          </div>
        `;
      }

      if (data.content.keywords) {
        const keywords = data.content.keywords.split(',').map(k => k.trim());
        html += `
          <div class="content-block">
            <h3 class="content-block-title">Keywords</h3>
            <div class="keywords-tags">
              ${keywords.map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
            </div>
          </div>
        `;
      }

      html += `
        <div class="content-block">
          <h3 class="content-block-title">Content</h3>
          <div class="content-block-text main-content">
            ${formatContent(data.content.content)}
          </div>
        </div>
      `;

      // Metadata
      if (data.metadata) {
        resultMetadata.innerHTML = `
          <div class="metadata-item">
            <span class="metadata-label">Words:</span>
            <span class="metadata-value">${data.metadata.word_count || 0}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Language:</span>
            <span class="metadata-value">${escapeHtml(data.metadata.language || '')}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Type:</span>
            <span class="metadata-value">${escapeHtml(data.metadata.content_type || '')}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Model:</span>
            <span class="metadata-value">${escapeHtml(data.metadata.model || 'gpt-4')}</span>
          </div>
        `;
      }
    } else if (type === 'improve' && data.improved) {
      html += `
        <div class="content-block">
          <h3 class="content-block-title">Original</h3>
          <div class="content-block-text">${formatContent(data.original)}</div>
        </div>
        <div class="content-block">
          <h3 class="content-block-title">Improved</h3>
          <div class="content-block-text main-content">${formatContent(data.improved)}</div>
        </div>
      `;
    } else if (type === 'translate' && data.translated) {
      html += `
        <div class="content-block">
          <h3 class="content-block-title">Original (${escapeHtml(data.from_language)})</h3>
          <div class="content-block-text">${formatContent(data.original)}</div>
        </div>
        <div class="content-block">
          <h3 class="content-block-title">Translated (${escapeHtml(data.to_language)})</h3>
          <div class="content-block-text main-content">${formatContent(data.translated)}</div>
        </div>
      `;
    }

    resultContent.innerHTML = html;
    resultSection.style.display = 'block';

    // Scroll to result
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function formatContent(content) {
    if (!content) return '';
    return content.split('\n\n').map(para => {
      if (para.trim()) {
        return `<p>${escapeHtml(para.trim())}</p>`;
      }
      return '';
    }).join('');
  }

  function initCopyDownload() {
    const copyBtn = document.getElementById('copy-btn');
    const downloadBtn = document.getElementById('download-btn');

    if (copyBtn) {
      copyBtn.addEventListener('click', handleCopy);
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', handleDownload);
    }
  }

  function handleCopy() {
    if (!currentResult) return;

    let text = '';
    if (currentResult.content) {
      if (currentResult.content.title) {
        text += currentResult.content.title + '\n\n';
      }
      text += currentResult.content.content || '';
    } else if (currentResult.improved) {
      text = currentResult.improved;
    } else if (currentResult.translated) {
      text = currentResult.translated;
    }

    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    }).catch(err => {
      console.error('Copy failed:', err);
      alert('Failed to copy to clipboard');
    });
  }

  function handleDownload() {
    if (!currentResult) return;

    let fileContent = '';
    const contentType = document.getElementById('content-type-select')?.value || 'content';

    if (currentResult.content) {
      if (currentResult.content.title) {
        fileContent += currentResult.content.title + '\n\n';
      }
      if (currentResult.content.meta_description) {
        fileContent += `Meta Description: ${currentResult.content.meta_description}\n\n`;
      }
      if (currentResult.content.keywords) {
        fileContent += `Keywords: ${currentResult.content.keywords}\n\n`;
      }
      fileContent += currentResult.content.content || '';
    } else if (currentResult.improved) {
      fileContent = `Original:\n${currentResult.original}\n\nImproved:\n${currentResult.improved}`;
    } else if (currentResult.translated) {
      fileContent = `Original (${currentResult.from_language}):\n${currentResult.original}\n\nTranslated (${currentResult.to_language}):\n${currentResult.translated}`;
    }

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contentType}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setLoading(loading) {
    isLoading = loading;
    const btn = activeTab === 'generate' ? document.getElementById('generate-btn') :
                activeTab === 'improve' ? document.getElementById('improve-btn') :
                document.getElementById('translate-btn');

    if (btn) {
      btn.disabled = loading;
      if (loading) {
        btn.innerHTML = `
          <span class="spinner"></span>
          ${activeTab === 'generate' ? 'Generating...' : activeTab === 'improve' ? 'Improving...' : 'Translating...'}
        `;
      } else {
        const icon = activeTab === 'generate' ? '✨' : activeTab === 'improve' ? '✨' : '🌐';
        const text = activeTab === 'generate' ? 'Generate Content' : activeTab === 'improve' ? 'Improve Content' : 'Translate';
        btn.innerHTML = `<span class="btn-icon">${icon}</span> ${text}`;
      }
    }
  }

  function showError(message) {
    const errorAlert = document.getElementById('error-alert');
    const errorMessage = document.getElementById('error-message');
    if (errorAlert && errorMessage) {
      errorMessage.textContent = message;
      errorAlert.style.display = 'flex';
      errorAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function hideError() {
    const errorAlert = document.getElementById('error-alert');
    if (errorAlert) {
      errorAlert.style.display = 'none';
    }
  }

  function hideResult() {
    const resultSection = document.getElementById('result-section');
    if (resultSection) {
      resultSection.style.display = 'none';
    }
    currentResult = null;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();

