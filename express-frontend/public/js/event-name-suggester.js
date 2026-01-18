// Event Name Suggester - Vanilla JavaScript

(function () {
  const $ = (id) => document.getElementById(id);

  const btn = $('ens-generate-btn');
  const errorBox = $('ens-error');
  const resultBox = $('ens-result');
  const suggestionsBox = $('ens-suggestions');
  const copyAllBtn = $('ens-copy-all');

  function showError(msg) {
    if (!errorBox) return;
    errorBox.style.display = 'block';
    errorBox.textContent = msg || 'Something went wrong. Please try again.';
  }

  function hideError() {
    if (!errorBox) return;
    errorBox.style.display = 'none';
    errorBox.textContent = '';
  }

  function showResult() {
    if (!resultBox) return;
    resultBox.style.display = 'block';
  }

  function hideResult() {
    if (!resultBox) return;
    resultBox.style.display = 'none';
  }

  function setLoading(isLoading) {
    if (!btn) return;
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? 'Generating...' : 'Suggest Names';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatCopyAll(list) {
    return list
      .map((item, idx) => {
        const name = item.name || '';
        const en = item.english_name ? ` (${item.english_name})` : '';
        const tagline = item.tagline ? ` — ${item.tagline}` : '';
        return `${idx + 1}. ${name}${en}${tagline}`.trim();
      })
      .join('\n');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function renderSuggestions(list) {
    if (!suggestionsBox) return;
    suggestionsBox.innerHTML = '';

    if (!Array.isArray(list) || list.length === 0) {
      suggestionsBox.innerHTML = `<div class="text-sm text-gray-600">No suggestions returned. Try adding more details.</div>`;
      return;
    }

    suggestionsBox.innerHTML = list
      .map((s, idx) => {
        const name = escapeHtml(s.name || '');
        const englishName = escapeHtml(s.english_name || '');
        const tagline = escapeHtml(s.tagline || '');
        const reason = escapeHtml(s.reason || '');
        const copyValue = `${s.name || ''}${s.english_name ? ' (' + s.english_name + ')' : ''}${s.tagline ? ' — ' + s.tagline : ''}`;

        return `
          <div class="result-card">
            <div class="result-card-header">
              <div class="result-card-title">
                <span class="badge">${idx + 1}</span>
                <span class="tamil-text">${name}</span>
                ${englishName ? `<span class="text-sm text-gray-600 ml-2">(${englishName})</span>` : ''}
              </div>
              <button class="btn btn-secondary btn-sm" data-copy="${escapeHtml(copyValue)}">Copy</button>
            </div>
            ${tagline ? `<div class="text-sm text-gray-700 mt-2">${tagline}</div>` : ''}
            ${reason ? `<div class="text-xs text-gray-500 mt-2">${reason}</div>` : ''}
          </div>
        `;
      })
      .join('');

    Array.from(suggestionsBox.querySelectorAll('button[data-copy]')).forEach((b) => {
      b.addEventListener('click', async () => {
        const val = b.getAttribute('data-copy') || '';
        const ok = await copyText(val);
        b.textContent = ok ? 'Copied' : 'Copy';
        setTimeout(() => (b.textContent = 'Copy'), 900);
      });
    });
  }

  async function handleGenerate() {
    hideError();
    hideResult();

    const eventType = $('ens-event-type')?.value?.trim() || '';
    const language = $('ens-language')?.value || 'tamil';
    const tone = $('ens-tone')?.value || 'professional';
    const audience = $('ens-audience')?.value?.trim() || '';
    const location = $('ens-location')?.value?.trim() || '';
    const date = $('ens-date')?.value?.trim() || '';
    const theme = $('ens-theme')?.value?.trim() || '';
    const keywords = $('ens-keywords')?.value?.trim() || '';
    const countRaw = ($('ens-count')?.value || '').trim();
    const count = parseInt(countRaw, 10);

    if (!eventType) {
      showError('Please enter an event type');
      return;
    }
    if (!Number.isFinite(count) || count < 3 || count > 20) {
      showError('Please enter a valid count between 3 and 20');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch('/api/event-name-suggester/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          event_type: eventType,
          audience,
          location,
          date,
          theme,
          tone,
          count,
          keywords,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success !== true) {
        throw new Error(data.error || data.details || 'Failed to generate suggestions');
      }

      renderSuggestions(data.suggestions || []);
      showResult();

      if (copyAllBtn) {
        copyAllBtn.onclick = async () => {
          const text = formatCopyAll(data.suggestions || []);
          const ok = await copyText(text);
          copyAllBtn.textContent = ok ? 'Copied' : 'Copy All';
          setTimeout(() => (copyAllBtn.textContent = 'Copy All'), 900);
        };
      }
    } catch (e) {
      showError(e.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (btn) btn.addEventListener('click', handleGenerate);
})();


