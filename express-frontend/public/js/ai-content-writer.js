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
    loadDraftFromUrl();
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
    const wordCountRaw = (document.getElementById('word-count-select')?.value || '').trim();
    const wordCount = parseInt(wordCountRaw, 10);
    const includeTitle = document.getElementById('include-title-checkbox').checked;
    const includeMeta = document.getElementById('include-meta-checkbox').checked;
    
    if (!Number.isFinite(wordCount) || wordCount < 100 || wordCount > 3000) {
      showError('Please enter a valid word count between 100 and 3000');
      return;
    }

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
    const publishTools = document.getElementById('publish-tools');

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

      // Show publish + social tools for generated content only
      if (publishTools) {
        publishTools.style.display = 'block';
        initPublishAndSocial(data);
      }
      // Show "Save to My Drafts" for logged-in users (same content as Workspace drafts)
      const saveDraftTools = document.getElementById('save-draft-tools');
      const isLoggedIn = document.querySelector('.ai-content-writer')?.getAttribute('data-user-logged-in') === 'true';
      if (saveDraftTools) {
        saveDraftTools.style.display = isLoggedIn ? 'block' : 'none';
        if (isLoggedIn) initSaveToDraft(data);
      }
    } else if (type === 'improve' && data.improved) {
      if (publishTools) publishTools.style.display = 'none';
      const saveDraftTools = document.getElementById('save-draft-tools');
      if (saveDraftTools) saveDraftTools.style.display = 'none';
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
      if (publishTools) publishTools.style.display = 'none';
      const saveDraftTools = document.getElementById('save-draft-tools');
      if (saveDraftTools) saveDraftTools.style.display = 'none';
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

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'post';
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('error', 'success');
    if (kind) el.classList.add(kind);
    el.style.display = 'block';
  }

  function setStatusHtml(el, html, kind) {
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove('error', 'success');
    if (kind) el.classList.add(kind);
    el.style.display = 'block';
  }

  function attachStatusLinkActions(statusEl) {
    if (!statusEl) return;
    const copyBtn = statusEl.querySelector('[data-copy-link]');
    const urlEl = statusEl.querySelector('[data-published-url]');
    if (copyBtn && urlEl && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = '1';
      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = urlEl.getAttribute('data-published-url') || urlEl.textContent || '';
        if (!url) return;
        try {
          await navigator.clipboard.writeText(url);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1200);
        } catch (_e2) {
          // fallback
          const ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1200);
        }
      });
    }
  }

  function isTokenExpired(token) {
    if (!token) return true;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const payload = JSON.parse(atob(base64));
      const now = Math.floor(Date.now() / 1000);
      return payload.exp ? payload.exp < now : true;
    } catch (_e) {
      return true;
    }
  }

  function getAccessToken() {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return null;
      if (isTokenExpired(token)) return null;
      return token;
    } catch (_e) {
      return null;
    }
  }

  function getAuthHeaders() {
    const h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const token = getAccessToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  function initSaveToDraft(data) {
    const btn = document.getElementById('save-to-draft-btn');
    const statusEl = document.getElementById('save-draft-status');
    if (!btn || !statusEl || btn.dataset.bound) return;

    btn.dataset.bound = '1';
    btn.addEventListener('click', async function() {
      if (!currentResult || !currentResult.content) {
        setStatus(statusEl, 'No content to save.', 'error');
        return;
      }

      const title = (currentResult.content.title || '').trim() || 'Untitled';
      const content = (currentResult.content.content || '').trim();
      if (!content) {
        setStatus(statusEl, 'Content is empty.', 'error');
        return;
      }

      btn.disabled = true;
      setStatus(statusEl, 'Saving...', null);

      try {
        const res = await fetch('/api/v1/ai-content-drafts', {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            title: title,
            content: content,
            prompt: (document.getElementById('prompt-input') || {}).value || '',
            content_type: (document.getElementById('content-type-select') || {}).value || '',
            language: (document.getElementById('language-select') || {}).value || '',
            tone: (document.getElementById('tone-select') || {}).value || '',
            meta_description: (currentResult.content.meta_description || '').trim(),
            keywords: (currentResult.content.keywords || '').trim()
          })
        });

        const json = await res.json().catch(function() { return {}; });

        if (res.status === 401) {
          const redirect = encodeURIComponent(window.location.pathname || '/tools/ai-content-writer');
          setStatusHtml(statusEl, 'Please <a href="/login?redirect=' + redirect + '" class="text-primary-700 font-semibold underline">log in</a> to save drafts.', 'error');
          btn.disabled = false;
          return;
        }

        if (!res.ok) {
          setStatus(statusEl, json.error || 'Failed to save draft', 'error');
          btn.disabled = false;
          return;
        }

        const draft = json.draft;
        const draftId = draft && draft.id;
        const listUrl = '/tools/ai-content-writer/drafts';
        setStatusHtml(
          statusEl,
          '<span class="font-semibold">Saved.</span> ' +
          '<a href="' + listUrl + '" class="text-primary-700 font-semibold underline">View my AI Content drafts</a>',
          'success'
        );
        btn.disabled = false;
      } catch (e) {
        setStatus(statusEl, e.message || 'Failed to save draft', 'error');
        btn.disabled = false;
      }
    });
  }

  async function safeJsonResponse(resp) {
    const raw = await resp.text();
    if (!raw) return { raw: '', json: null };
    try {
      return { raw, json: JSON.parse(raw) };
    } catch (_e) {
      return { raw, json: null };
    }
  }

  async function initPublishAndSocial(data) {
    // Elements
    const templateSelect = document.getElementById('blog-template-select');
    const titleInput = document.getElementById('blog-title-input');
    const slugInput = document.getElementById('blog-slug-input');
    const metaInput = document.getElementById('blog-meta-input');
    const keywordsInput = document.getElementById('blog-keywords-input');
    const statusSelect = document.getElementById('blog-status-select');
    const previewBtn = document.getElementById('blog-preview-btn');
    const publishBtn = document.getElementById('blog-publish-btn');
    const publishStatus = document.getElementById('blog-publish-status');
    const previewEl = document.getElementById('blog-preview');
    const readingTimeEl = document.getElementById('blog-reading-time');

    // Social variants are a premium feature; UI is currently disabled.
    // Keep the code paths for later release.

    // Inputs from generated content
    const language = data?.metadata?.language || document.getElementById('language-select')?.value || 'tamil';
    const tone = document.getElementById('tone-select')?.value || data?.metadata?.tone || 'professional';
    const generatedTitle = data?.content?.title || '';
    const generatedMeta = data?.content?.meta_description || '';
    const generatedKeywords = data?.content?.keywords || '';
    const generatedContent = data?.content?.content || '';

    // Set defaults once (do not clobber user edits after first init)
    if (titleInput && !titleInput.dataset.init) {
      titleInput.value = generatedTitle || (document.getElementById('prompt-input')?.value || 'Untitled');
      titleInput.dataset.init = '1';
    }
    if (slugInput && !slugInput.dataset.init) {
      slugInput.value = slugify(titleInput ? titleInput.value : generatedTitle);
      slugInput.dataset.init = '1';
    }
    if (metaInput && !metaInput.dataset.init) {
      metaInput.value = generatedMeta || '';
      metaInput.dataset.init = '1';
    }
    if (keywordsInput && !keywordsInput.dataset.init) {
      keywordsInput.value = generatedKeywords || '';
      keywordsInput.dataset.init = '1';
    }

    if (titleInput && slugInput) {
      titleInput.addEventListener('input', () => {
        // only auto-update slug if user hasn't manually edited it
        if (!slugInput.dataset.touched) {
          slugInput.value = slugify(titleInput.value);
        }
      });
      slugInput.addEventListener('input', () => {
        slugInput.dataset.touched = '1';
      });
    }

    let lastTemplateHtml = '';
    let lastExcerpt = '';

    async function renderPreview() {
      if (!previewEl) return;
      setStatus(publishStatus, 'Rendering preview...', null);
      try {
        const response = await fetch('/api/ai-content-writer/render-blog-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: templateSelect ? templateSelect.value : 'minimal',
            title: titleInput ? titleInput.value : generatedTitle,
            content: generatedContent,
            language,
            meta_description: metaInput ? metaInput.value : generatedMeta,
            keywords: keywordsInput ? keywordsInput.value : generatedKeywords,
          }),
        });
        const json = await response.json();
        if (!response.ok || !json?.success) {
          throw new Error(json?.error || 'Preview render failed');
        }
        lastTemplateHtml = json.html || '';
        lastExcerpt = json.excerpt || '';
        previewEl.innerHTML = lastTemplateHtml;
        if (readingTimeEl) {
          readingTimeEl.textContent = `${json.reading_time_minutes || 1} min read`;
        }
        setStatus(publishStatus, 'Preview updated.', 'success');
        setTimeout(() => { if (publishStatus) publishStatus.style.display = 'none'; }, 1200);
      } catch (e) {
        setStatus(publishStatus, e.message || 'Preview render failed', 'error');
      }
    }

    if (previewBtn && !previewBtn.dataset.bound) {
      previewBtn.dataset.bound = '1';
      previewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        renderPreview();
      });
    }
    if (templateSelect && !templateSelect.dataset.bound) {
      templateSelect.dataset.bound = '1';
      templateSelect.addEventListener('change', () => renderPreview());
    }

    // Render once on init for immediate preview
    if (previewEl && !previewEl.dataset.init) {
      previewEl.dataset.init = '1';
      await renderPreview();
    }

    if (publishBtn && !publishBtn.dataset.bound) {
      publishBtn.dataset.bound = '1';
      publishBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        setStatus(publishStatus, 'Publishing...', null);
        try {
          if (!lastTemplateHtml) {
            await renderPreview();
          }
          const statusValue = statusSelect ? statusSelect.value : 'draft';
          const token = getAccessToken();
          const headers = { 'Content-Type': 'application/json' };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const resp = await fetch('/api/blog/publish', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({
              title: titleInput ? titleInput.value : generatedTitle,
              slug: slugInput ? slugInput.value : slugify(generatedTitle),
              language,
              content_html: lastTemplateHtml,
              content_text: generatedContent,
              excerpt: lastExcerpt,
              meta_description: metaInput ? metaInput.value : generatedMeta,
              keywords: keywordsInput ? keywordsInput.value : generatedKeywords,
              status: statusValue,
            }),
          });

          const { raw, json } = await safeJsonResponse(resp);

          if (resp.status === 401) {
            const redirect = encodeURIComponent('/tools/ai-content-writer');
            setStatusHtml(
              publishStatus,
              `Please <a href="/login?redirect=${redirect}" class="text-primary-700 font-semibold underline">login</a> to publish.`,
              'error'
            );
            return;
          }

          if (!resp.ok || !json?.success) {
            const errMsg =
              json?.error ||
              json?.message ||
              json?.details ||
              (raw ? raw.slice(0, 200) : null) ||
              `Publish failed (HTTP ${resp.status})`;
            throw new Error(errMsg);
          }

          const publishedSlug = json.post?.slug || (slugInput ? slugInput.value : '');
          const safeSlug = encodeURIComponent(String(publishedSlug || '').trim());

          if (statusValue === 'published') {
            const fullUrl = `${window.location.origin}/blog/${safeSlug}`;
            setStatusHtml(
              publishStatus,
              `
                <div class="font-semibold mb-1">Published to Blog</div>
                <div class="text-sm break-all mb-2">
                  <a class="underline" href="/blog/${safeSlug}" data-published-url="${fullUrl}">${fullUrl}</a>
                </div>
                <div class="flex items-center gap-2">
                  <a class="px-3 py-1.5 rounded-lg bg-white border border-green-200 text-sm font-semibold" href="/blog/${safeSlug}">Open</a>
                  <button class="px-3 py-1.5 rounded-lg bg-white border border-green-200 text-sm font-semibold" type="button" data-copy-link="1">Copy link</button>
                </div>
              `.trim(),
              'success'
            );
            attachStatusLinkActions(publishStatus);
            publishStatus?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
          } else {
            const fullUrl = `${window.location.origin}/my-blogs`;
            setStatusHtml(
              publishStatus,
              `
                <div class="font-semibold mb-1">Saved as Draft</div>
                <div class="text-sm mb-2">You can find it here:</div>
                <div class="text-sm break-all mb-2">
                  <a class="underline" href="/my-blogs" data-published-url="${fullUrl}">${fullUrl}</a>
                </div>
                <div class="flex items-center gap-2">
                  <a class="px-3 py-1.5 rounded-lg bg-white border border-green-200 text-sm font-semibold" href="/my-blogs">Open My Blogs</a>
                  <button class="px-3 py-1.5 rounded-lg bg-white border border-green-200 text-sm font-semibold" type="button" data-copy-link="1">Copy link</button>
                </div>
              `.trim(),
              'success'
            );
            attachStatusLinkActions(publishStatus);
            publishStatus?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
          }
        } catch (err) {
          setStatus(publishStatus, err.message || 'Publish failed', 'error');
        }
      });
    }

    // NOTE: Social variants code intentionally disabled (premium feature).
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

  async function loadDraftFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const draftId = params.get('draftId');
    if (!draftId) return;
    const headers = getAuthHeaders();
    try {
      const res = await fetch('/api/v1/ai-content-drafts/' + encodeURIComponent(draftId), {
        method: 'GET',
        credentials: 'include',
        headers: headers
      });
      if (res.status === 401) {
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + '?draftId=' + draftId);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(function() { return {}; });
        showError(j.error || 'Failed to load draft');
        return;
      }
      const j = await res.json();
      const d = j.draft;
      if (!d || !d.content) {
        showError('Draft not found');
        return;
      }
      currentResult = {
        content: {
          title: d.title || '',
          content: d.content,
          meta_description: d.meta_description || '',
          keywords: d.keywords || ''
        },
        metadata: {
          word_count: d.word_count,
          language: d.language || '',
          content_type: d.content_type || ''
        }
      };
      switchTab('generate');
      showResult('generate', currentResult);
    } catch (e) {
      showError(e.message || 'Failed to load draft');
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

  // Expose copy function globally for non-admin users
  window.copyGeneratedContent = function() {
    const copyStatus = document.getElementById('copy-status');
    
    if (!currentResult || !currentResult.content) {
      if (copyStatus) {
        copyStatus.style.display = 'block';
        copyStatus.textContent = 'No content to copy. Generate content first.';
        copyStatus.className = 'publish-status error';
      }
      return;
    }

    const content = currentResult.content;
    let textToCopy = '';

    // Build the text to copy
    if (content.title) {
      textToCopy += content.title + '\n\n';
    }
    if (content.content) {
      textToCopy += content.content;
    }

    navigator.clipboard.writeText(textToCopy).then(function() {
      if (copyStatus) {
        copyStatus.style.display = 'block';
        copyStatus.textContent = '✓ Content copied to clipboard!';
        copyStatus.className = 'publish-status success';
        setTimeout(function() {
          copyStatus.style.display = 'none';
        }, 3000);
      }
    }).catch(function(err) {
      console.error('Copy failed:', err);
      if (copyStatus) {
        copyStatus.style.display = 'block';
        copyStatus.textContent = 'Failed to copy. Please select and copy manually.';
        copyStatus.className = 'publish-status error';
      }
    });
  };
})();

