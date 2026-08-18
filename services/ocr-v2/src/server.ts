// Local dev server for the OCR v2 baseline. NOT for production.
//
// Renders three panels:
//   1. Image dropzone + preview
//   2. Raw OCR — verbatim transcription (exactly what's on the page)
//   3. Suggestions — per-word "the writer may have meant this instead"
//      cards with confidence bars and rationale. NEVER silently applied.
//
// Runs on port 3081 by default. Reads GEMINI_API_KEY / GOOGLE_GENAI_API_KEY
// from the repo-root .env.local so no separate secret setup is needed if
// the main app is already configured locally.

import express, { Request, Response } from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { transcribeBaseline } from './transcribe.js';
import { graphemeCount } from './tamil.js';

// Load env from repo-root .env.local (two directories up from src/).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = path.resolve(HERE, '../../..', '.env.local');
try {
  const raw = await fs.readFile(ROOT_ENV, 'utf-8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env.local — that's fine, key may already be exported */ }

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || '';
const MODEL = process.env.OCR_V2_MODEL || 'gemini-2.5-flash';
const PORT = Number(process.env.OCR_V2_PORT || 3081);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Single-file HTML — inline CSS + JS so the whole tool is one server
// with no build step. Kept intentionally chunky vs micro-templated —
// easier to iterate on during phase-0 experiments.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OCR v2 — Verbatim + Suggestions Demo</title>
<style>
  :root {
    --bg: #0f172a; --panel: #1e293b; --border: #334155;
    --text: #e2e8f0; --muted: #94a3b8;
    --accent: #fbbf24; --accent2: #a855f7;
    --ok: #10b981; --warn: #f59e0b; --err: #ef4444;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    min-height: 100vh; }
  header { padding: 16px 24px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between; }
  header h1 { margin: 0; font-size: 17px; font-weight: 600; }
  header .badge { background: var(--panel); padding: 4px 10px; border-radius: 999px;
    font-size: 12px; color: var(--muted); font-family: ui-monospace, monospace; }
  main { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 12px 24px 24px; }
  @media (max-width: 1200px) { main { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 800px)  { main { grid-template-columns: 1fr; } }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    overflow: hidden; display: flex; flex-direction: column; min-height: 540px; }
  .panel-header { padding: 10px 14px; border-bottom: 1px solid var(--border);
    font-size: 12px; color: var(--muted); font-weight: 600;
    display: flex; align-items: center; justify-content: space-between;
    text-transform: uppercase; letter-spacing: 0.05em; }
  .panel-header .subtitle { font-weight: 400; text-transform: none; letter-spacing: 0; }

  /* Drop / preview column */
  .drop {
    flex: 1; margin: 14px; border: 2px dashed var(--border); border-radius: 10px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 28px; cursor: pointer; transition: all 0.15s;
    min-height: 200px;
  }
  .drop:hover, .drop.dragover { border-color: var(--accent); background: rgba(251, 191, 36, 0.05); }
  .drop-icon { font-size: 44px; margin-bottom: 10px; opacity: 0.5; }
  .drop-title { font-size: 14px; margin-bottom: 6px; }
  .drop-hint { font-size: 12px; color: var(--muted); }
  #preview { max-width: 100%; max-height: 460px; margin: 14px auto; display: none;
    border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
  #btnRun { display: none; margin: 0 14px 14px; padding: 10px 18px;
    background: var(--accent); color: #1e293b; border: none; border-radius: 8px;
    font-weight: 600; cursor: pointer; font-size: 14px; }
  #btnRun:hover:not(:disabled) { background: #f59e0b; }
  #btnRun:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Raw OCR column */
  #rawText { flex: 1; padding: 14px; overflow-y: auto; white-space: pre-wrap;
    font-family: "Latha", "Noto Sans Tamil", sans-serif; font-size: 15px; line-height: 1.65;
    color: var(--text); }
  #rawText.placeholder { color: var(--muted); font-style: italic; }
  #rawText .flagged { background: rgba(245, 158, 11, 0.15); border-bottom: 1.5px dashed var(--warn);
    padding: 0 2px; border-radius: 2px; cursor: help; }

  /* Suggestions column */
  #suggestions { flex: 1; padding: 8px; overflow-y: auto; }
  #suggestions.placeholder { padding: 14px; color: var(--muted); font-style: italic; }
  .card { background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border);
    border-left: 3px solid var(--warn); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
  .card .row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
    font-family: "Latha", "Noto Sans Tamil", sans-serif; font-size: 15px; }
  .card .raw-word { color: var(--warn); text-decoration: line-through; }
  .card .arrow { color: var(--muted); font-size: 13px; }
  .card .sug-word { color: var(--ok); font-weight: 600; }
  .card .reason { font-size: 12px; color: var(--muted); margin-top: 6px; line-height: 1.45; }
  .card .conf-wrap { margin-top: 6px; display: flex; align-items: center; gap: 8px; }
  .card .conf-label { font-size: 10px; color: var(--muted); font-family: ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.05em; }
  .card .conf-bar { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .card .conf-fill { height: 100%; background: linear-gradient(90deg, var(--warn), var(--ok)); }
  .card .context { font-size: 11px; color: var(--muted); margin-top: 6px;
    font-family: "Latha", "Noto Sans Tamil", sans-serif; opacity: 0.7; }
  .card .actions { display: flex; gap: 6px; margin-top: 8px; }
  .card button { flex: 1; padding: 5px 10px; border-radius: 6px; font-size: 12px;
    font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: transparent;
    color: var(--text); transition: all 0.1s; }
  .card button.apply { border-color: var(--ok); color: var(--ok); }
  .card button.apply:hover { background: var(--ok); color: #052e16; }
  .card button.reject { border-color: var(--muted); color: var(--muted); }
  .card button.reject:hover { background: var(--border); }
  .card.applied { border-left-color: var(--ok); opacity: 0.75; }
  .card.applied button { display: none; }
  .card.applied::after { content: "✓ applied"; font-size: 10px; color: var(--ok);
    display: block; margin-top: 6px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; }
  .card.rejected { border-left-color: var(--muted); opacity: 0.4; }
  .card.rejected button { display: none; }
  .card.rejected::after { content: "✗ ignored"; font-size: 10px; color: var(--muted);
    display: block; margin-top: 6px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; }
  .rawWordApplied { background: rgba(16, 185, 129, 0.15); color: var(--ok);
    border-bottom: 1.5px solid var(--ok); padding: 0 2px; border-radius: 2px; }

  /* Meta bar */
  #meta { padding: 10px 14px; border-top: 1px solid var(--border); display: none;
    font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }
  #meta span { margin-right: 14px; }
  #meta .ok { color: var(--ok); }
  #meta .err { color: var(--err); }
  .keywarn { padding: 12px 24px; background: rgba(239, 68, 68, 0.1);
    border-bottom: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;
    font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1>🔬 OCR v2 · Verbatim + Suggestions</h1>
  <div class="badge">${MODEL} · single-pass · no preprocessing</div>
</header>
${!API_KEY ? '<div class="keywarn">⚠️ No GEMINI_API_KEY / GOOGLE_GENAI_API_KEY found in env. Set it in the repo-root .env.local and restart this server.</div>' : ''}
<main>
  <!-- Column 1: image -->
  <section class="panel">
    <div class="panel-header">
      <span>Image</span>
      <span id="filename" class="subtitle"></span>
    </div>
    <label for="file" class="drop" id="drop">
      <div class="drop-icon">📄</div>
      <div class="drop-title">Drop a Tamil image here</div>
      <div class="drop-hint">or click · jpg / png / webp / heic · up to 20MB</div>
    </label>
    <input type="file" id="file" accept="image/*" style="display:none" />
    <img id="preview" alt="preview" />
    <button id="btnRun" disabled>Transcribe</button>
  </section>

  <!-- Column 2: raw verbatim OCR -->
  <section class="panel">
    <div class="panel-header">
      <span>Raw OCR (verbatim)</span>
      <span id="status" class="subtitle"></span>
    </div>
    <div id="rawText" class="placeholder">
      What the camera actually saw on the page — no auto-correction,
      no normalization. Suggestions (right panel) never modify this
      text; they only propose.
    </div>
    <div id="meta"></div>
  </section>

  <!-- Column 3: suggestions -->
  <section class="panel">
    <div class="panel-header">
      <span>Suggestions <span id="sugCount" class="subtitle"></span></span>
      <span class="subtitle" style="font-family: ui-monospace, monospace; font-size: 10px;">tap-to-fix in phase 3</span>
    </div>
    <div id="suggestions" class="placeholder">
      When the model thinks a raw word may be misspelled or misread,
      it flags it here with a proposed correction and confidence.
      Never applied silently.
    </div>
  </section>
</main>

<script>
  const drop = document.getElementById('drop');
  const file = document.getElementById('file');
  const preview = document.getElementById('preview');
  const btn = document.getElementById('btnRun');
  const filename = document.getElementById('filename');
  const rawText = document.getElementById('rawText');
  const suggestions = document.getElementById('suggestions');
  const meta = document.getElementById('meta');
  const status = document.getElementById('status');
  const sugCount = document.getElementById('sugCount');
  let currentFile = null;

  function setFile(f) {
    if (!f) return;
    currentFile = f;
    filename.textContent = f.name + ' · ' + Math.round(f.size / 1024) + ' KB';
    preview.src = URL.createObjectURL(f);
    preview.style.display = 'block';
    btn.style.display = 'block';
    btn.disabled = false;
    drop.style.display = 'none';
  }
  file.addEventListener('change', () => setFile(file.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });

  // Escape for use inside HTML attributes/content
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Session state: the "working text" starts as raw_text and gets
  // per-word patches applied as the user clicks Apply on suggestion
  // cards. Reject just marks the card as ignored — no text change.
  // Kept in module scope so re-renders (after apply) reuse the same
  // running state. Cleared on a new transcription.
  let currentRaw = '';
  let currentWorking = '';
  let sugState = [];   // per-suggestion: 'pending' | 'applied' | 'rejected'
  let sugList = [];

  function repaintRaw() {
    // Walk each token; if applied, render the suggested word (green);
    // if the raw_word is flagged by any suggestion, keep the amber
    // highlight so users can find it. Whole-word matching for now —
    // phase 2 adds char offsets so duplicates align precisely.
    const applied = new Map();  // raw_word -> suggested_word (last applied wins)
    const flagged = new Set();
    sugList.forEach((s, i) => {
      if (!s.raw_word) return;
      flagged.add(s.raw_word);
      if (sugState[i] === 'applied') applied.set(s.raw_word, s.suggested_word);
    });
    rawText.innerHTML = esc(currentRaw).split(/(\\s+)/).map((tok) => {
      const bare = tok.trim();
      if (!bare) return tok;
      if (applied.has(bare)) {
        return '<span class="rawWordApplied" title="applied: ' + esc(bare) + ' → ' + esc(applied.get(bare)) + '">' + esc(applied.get(bare)) + '</span>';
      }
      if (flagged.has(bare)) {
        return '<span class="flagged" title="see Suggestions panel →">' + esc(tok) + '</span>';
      }
      return tok;
    }).join('');
  }

  function repaintSuggestions() {
    if (!sugList.length) {
      suggestions.className = 'placeholder';
      suggestions.style.padding = '14px';
      suggestions.textContent = 'No suggestions — the model believes the raw transcription is accurate as-is.';
      sugCount.textContent = '(0)';
      return;
    }
    suggestions.className = '';
    suggestions.style.padding = '8px';
    const remaining = sugState.filter((s) => s === 'pending').length;
    sugCount.textContent = '(' + remaining + ' pending / ' + sugList.length + ' total)';
    suggestions.innerHTML = sugList.map((s, i) => {
      const conf = Math.round((s.confidence || 0) * 100);
      const ctx = [s.context_before, s.context_after].filter(Boolean).join(' · ');
      const stateClass = sugState[i] === 'applied' ? ' applied' : sugState[i] === 'rejected' ? ' rejected' : '';
      return \`<div class="card\${stateClass}" data-idx="\${i}">
        <div class="row">
          <span class="raw-word">\${esc(s.raw_word)}</span>
          <span class="arrow">→</span>
          <span class="sug-word">\${esc(s.suggested_word)}</span>
        </div>
        <div class="reason">\${esc(s.reason)}</div>
        <div class="conf-wrap">
          <span class="conf-label">conf</span>
          <div class="conf-bar"><div class="conf-fill" style="width: \${conf}%"></div></div>
          <span class="conf-label">\${conf}%</span>
        </div>
        \${ctx ? '<div class="context">context: ' + esc(ctx) + '</div>' : ''}
        <div class="actions">
          <button class="apply" data-action="apply" data-idx="\${i}">✓ Apply</button>
          <button class="reject" data-action="reject" data-idx="\${i}">✗ Ignore</button>
        </div>
      </div>\`;
    }).join('');
  }

  suggestions.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-idx'));
    const action = btn.getAttribute('data-action');
    if (Number.isFinite(idx) && sugState[idx] === 'pending') {
      sugState[idx] = action === 'apply' ? 'applied' : 'rejected';
      repaintRaw();
      repaintSuggestions();
    }
  });

  function loadTranscription(data) {
    currentRaw = data.raw_text || '';
    currentWorking = currentRaw;
    sugList = Array.isArray(data.suggestions) ? data.suggestions : [];
    sugState = sugList.map(() => 'pending');
    repaintRaw();
    repaintSuggestions();
  }

  btn.addEventListener('click', async () => {
    if (!currentFile) return;
    btn.disabled = true;
    btn.textContent = 'Transcribing…';
    status.textContent = 'calling Gemini…';
    rawText.className = 'placeholder';
    rawText.textContent = '';
    suggestions.className = 'placeholder';
    suggestions.style.padding = '14px';
    suggestions.textContent = 'Waiting for response…';
    meta.style.display = 'none';
    sugCount.textContent = '';

    try {
      const fd = new FormData();
      fd.append('image', currentFile);
      const t0 = Date.now();
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const wall = Date.now() - t0;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));

      rawText.className = '';
      loadTranscription(data);

      status.textContent = 'ok';
      meta.style.display = 'block';
      meta.innerHTML =
        '<span>graphemes: <b>' + data.graphemes + '</b></span>' +
        '<span>suggestions: <b>' + (data.suggestions || []).length + '</b></span>' +
        '<span>server: <b>' + data.wallMs + 'ms</b></span>' +
        '<span>round-trip: <b>' + wall + 'ms</b></span>' +
        '<span>cost: <b>$' + (data.costUsd || 0).toFixed(4) + '</b></span>' +
        '<span class="ok">✓ ' + (data.model || '') + '</span>';
    } catch (err) {
      rawText.className = '';
      rawText.textContent = 'Error: ' + err.message;
      suggestions.className = 'placeholder';
      suggestions.style.padding = '14px';
      suggestions.textContent = '—';
      status.innerHTML = '<span style="color: var(--err)">failed</span>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Transcribe again';
    }
  });
</script>
</body>
</html>`;

app.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(PAGE);
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(API_KEY) });
});

app.post('/api/ocr', upload.single('image'), async (req: Request, res: Response) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY / GOOGLE_GENAI_API_KEY not set in env' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'no file uploaded (field "image")' });
  }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-v2-'));
  const ext = path.extname(req.file.originalname || '.jpg') || '.jpg';
  const tmpPath = path.join(tmpDir, 'upload' + ext);
  try {
    await fs.writeFile(tmpPath, req.file.buffer);
    const r = await transcribeBaseline(tmpPath, { model: MODEL, apiKey: API_KEY });
    res.json({
      raw_text: r.raw_text,
      suggestions: r.suggestions,
      graphemes: graphemeCount(r.raw_text),
      wallMs: r.wallMs,
      costUsd: r.costUsd,
      model: MODEL,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`\n🔬 OCR v2 verbatim+suggestions demo running`);
  console.log(`   URL:   http://localhost:${PORT}`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Key:   ${API_KEY ? '✓ loaded (' + API_KEY.slice(0, 6) + '…)' : '⚠ MISSING — set GEMINI_API_KEY or GOOGLE_GENAI_API_KEY'}`);
  console.log('');
});
