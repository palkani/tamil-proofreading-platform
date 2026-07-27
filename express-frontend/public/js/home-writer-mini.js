// Home page mini AI Content Writer (taste)
(function () {
  const $ = (id) => document.getElementById(id);

  // The home demo is a short "taste" — hard cap on the generated length. The server
  // enforces the same 50 for any request tagged source:'home-demo', so editing this
  // (or the number field) can't get more out of the demo.
  const HOME_DEMO_MAX_WORDS = 50;

  function showStatus(msg, kind) {
    const el = $('home-writer-status');
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.toggle('text-red-600', kind === 'error');
    el.classList.toggle('text-gray-600', kind !== 'error');
    el.textContent = msg || '';
  }

  function hideStatus() {
    const el = $('home-writer-status');
    if (!el) return;
    el.classList.add('hidden');
    el.textContent = '';
  }

  function setLoading(isLoading) {
    const btn = $('home-writer-generate');
    if (!btn) return;
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? 'Generating…' : 'Generate';
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function generate() {
    hideStatus();
    const prompt = ($('home-writer-prompt')?.value || '').trim();
    if (!prompt) {
      showStatus('Please enter a prompt.', 'error');
      return;
    }

    const language = $('home-writer-language')?.value || 'tamil';
    const tone = $('home-writer-tone')?.value || 'professional';
    const contentType = $('home-writer-type')?.value || 'blog';
    const wcRaw = String($('home-writer-word-count')?.value || '').trim();
    let wordCount = parseInt(wcRaw, 10);
    if (!Number.isFinite(wordCount)) wordCount = HOME_DEMO_MAX_WORDS;
    wordCount = Math.max(20, Math.min(HOME_DEMO_MAX_WORDS, wordCount)); // home demo cap
    if ($('home-writer-word-count')) $('home-writer-word-count').value = String(wordCount);

    const outWrap = $('home-writer-output');
    const outText = $('home-writer-output-text');
    if (outWrap) outWrap.classList.add('hidden');
    if (outText) outText.textContent = '';

    setLoading(true);
    showStatus('Generating content…', 'info');

    try {
      const resp = await fetch('/api/ai-content-writer/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          language,
          content_type: contentType,
          tone,
          word_count: wordCount,
          include_title: true,
          include_meta: false,
          source: 'home-demo', // server hard-caps word_count to 50 for this source
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success !== true) {
        throw new Error(data.error || data.details || 'Failed to generate content');
      }

      const content = data?.content?.content || '';
      const title = data?.content?.title || '';
      const combined = title ? `${title}\n\n${content}` : content;

      if (outText) outText.textContent = combined;
      if (outWrap) outWrap.classList.remove('hidden');
      hideStatus();
    } catch (e) {
      showStatus(e.message || 'Failed to generate content.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function init() {
    const genBtn = $('home-writer-generate');
    if (genBtn) genBtn.addEventListener('click', generate);

    // Keep the number field within the demo cap as the user types/blurs.
    const wcField = $('home-writer-word-count');
    if (wcField) {
      const clamp = () => {
        let v = parseInt(wcField.value, 10);
        if (!Number.isFinite(v)) return;
        if (v > HOME_DEMO_MAX_WORDS) wcField.value = String(HOME_DEMO_MAX_WORDS);
        if (v < 20) wcField.value = '20';
      };
      wcField.addEventListener('change', clamp);
      wcField.addEventListener('blur', clamp);
    }

    const copyBtn = $('home-writer-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const text = $('home-writer-output-text')?.textContent || '';
        const ok = await copyText(text);
        copyBtn.textContent = ok ? 'Copied' : 'Copy';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 900);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();


