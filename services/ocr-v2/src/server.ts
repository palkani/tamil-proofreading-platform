// Local dev server for the OCR v2 baseline. NOT for production.
//
// UX-polished demo — three-column layout with:
//   1. Image column: drop zone → preview → prominent primary CTA
//      with keyboard shortcuts, multi-stage progress feedback,
//      "Change image" affordance, inline error recovery with Retry.
//   2. Raw OCR (verbatim) — flagged words underlined; applied
//      suggestions render inline in green.
//   3. Suggestions cards with ✓ Apply / ✗ Ignore actions, confidence
//      bars, context words, and a live pending-counter.
//
// Keyboard shortcuts (macOS ⌘, Windows/Linux Ctrl):
//   Enter        Transcribe (when image is loaded and idle)
//   ⌘/Ctrl+U     Open file picker
//   Esc          Clear current image + results (with confirm)
//   ⌘/Ctrl+Enter Same as Enter (works when focus is inside any panel)
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
import { runPipeline, PipelineMode } from './pipeline.js';
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
// with no build step. Structured as a finite-state machine for the
// image column: idle → ready → processing → { success | error }.
// State transitions are explicit so every user action has a clear
// visual response and a keyboard equivalent.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OCR v2 — Verbatim + Suggestions Demo</title>
<style>
  :root {
    /* Palette aligned to prooftamil.com brand:
       --bg / --panel / --panel-2 / --border : deep navy shades built
         on the site's primary #1E1B4B for on-brand structure
         (dark-theme UI kept — better for staring at scanned pages).
       --accent / --accent-2 : the amber gradient used across every
         OCR CTA on the main site (#F59E0B → #D97706). Primary
         action button + progress ring are amber.
       --purple : #7C3AED — reserved for AI/suggestion accents,
         matching how AI Content Writer + AI features are colored
         on the site. Used on suggestion cards + ring gradient stop. */
    --bg: #0f0d2a; --panel: #1a1745; --panel-2: #221e56; --border: #2f2a6b;
    --text: #e6ecf8; --text-strong: #f5f8ff; --muted: #9691c3;
    --accent: #F59E0B; --accent-2: #D97706;
    --purple: #7C3AED; --purple-2: #A855F7;
    --accent-glow: rgba(245, 158, 11, 0.28);
    --ok: #10b981; --warn: #F59E0B; --err: #ef4444;
    --radius: 12px; --radius-sm: 8px;
    --shadow-primary: 0 8px 24px rgba(245, 158, 11, 0.28), 0 2px 4px rgba(0,0,0,0.2);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    min-height: 100vh; -webkit-font-smoothing: antialiased; }

  /* ── Header ───────────────────────────────────────────────── */
  header { padding: 14px 24px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
    background: linear-gradient(180deg, var(--panel), var(--bg)); }
  header h1 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em;
    display: flex; align-items: center; gap: 8px; }
  header h1 .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok);
    box-shadow: 0 0 8px var(--ok); animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  header .badge { background: var(--panel-2); padding: 4px 10px; border-radius: 999px;
    font-size: 11px; color: var(--muted); font-family: ui-monospace, "SF Mono", monospace;
    border: 1px solid var(--border); }
  header .header-right { display: flex; align-items: center; gap: 12px; }

  /* Mode picker — segmented control in the header.
     Lets users A/B pipeline variants against the same image without
     needing separate URLs or endpoint changes. Selection persists in
     localStorage so refreshes stick. */
  .mode-picker { display: inline-flex; padding: 3px; background: var(--panel-2);
    border: 1px solid var(--border); border-radius: 999px; gap: 2px; }
  .mode-picker button { background: transparent; border: none; color: var(--muted);
    padding: 5px 12px; font-size: 11px; font-weight: 600; cursor: pointer;
    border-radius: 999px; font-family: inherit; letter-spacing: 0.02em;
    transition: all 0.15s; text-transform: uppercase; }
  .mode-picker button:hover:not(.active) { color: var(--text); }
  .mode-picker button.active { background: linear-gradient(135deg, var(--accent), var(--accent-2));
    color: #1E1B4B; }

  /* ── Layout ───────────────────────────────────────────────── */
  main { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 12px 24px 24px; }
  @media (max-width: 1200px) { main { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 800px)  { main { grid-template-columns: 1fr; } }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; display: flex; flex-direction: column; min-height: 620px; }
  .panel-header { padding: 12px 16px; border-bottom: 1px solid var(--border);
    font-size: 11px; color: var(--muted); font-weight: 700;
    display: flex; align-items: center; justify-content: space-between;
    text-transform: uppercase; letter-spacing: 0.08em;
    background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent); }
  .panel-header .subtitle { font-weight: 500; text-transform: none; letter-spacing: 0;
    color: var(--muted); font-family: ui-monospace, "SF Mono", monospace; font-size: 11px; }

  /* ── Image column ─────────────────────────────────────────── */
  .img-column { position: relative; }
  .img-body { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 12px;
    min-height: 0; }

  /* Empty state */
  .drop { flex: 1; border: 2px dashed var(--border); border-radius: var(--radius-sm);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 32px; cursor: pointer; transition: all 0.15s;
    min-height: 260px; background: rgba(255,255,255,0.01); }
  .drop:hover, .drop.dragover { border-color: var(--accent-2); background: rgba(168, 85, 247, 0.06); }
  .drop-icon { font-size: 44px; margin-bottom: 12px; opacity: 0.55; transition: transform 0.2s; }
  .drop:hover .drop-icon { transform: translateY(-3px) scale(1.05); opacity: 0.85; }
  .drop-title { font-size: 15px; margin-bottom: 6px; color: var(--text-strong); font-weight: 600; }
  .drop-hint { font-size: 12px; color: var(--muted); margin-bottom: 20px; line-height: 1.5; }
  .drop-kbd { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; }

  /* Preview */
  .preview-wrap { flex: 1; display: flex; align-items: center; justify-content: center;
    min-height: 200px; overflow: hidden; border-radius: var(--radius-sm);
    background: rgba(0,0,0,0.25); }
  .preview-wrap img { max-width: 100%; max-height: 420px; border-radius: var(--radius-sm);
    box-shadow: 0 4px 24px rgba(0,0,0,0.35); }
  .file-meta { display: flex; align-items: center; justify-content: space-between;
    font-size: 12px; color: var(--muted); font-family: ui-monospace, "SF Mono", monospace;
    padding: 0 4px; }
  .file-meta .filename { color: var(--text); font-weight: 500; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }

  /* Action row (loaded state) */
  .actions-row { display: flex; gap: 8px; align-items: stretch; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    border: none; border-radius: var(--radius-sm); cursor: pointer;
    font-family: inherit; font-weight: 600; transition: all 0.12s;
    padding: 12px 16px; font-size: 14px; user-select: none;
    -webkit-tap-highlight-color: transparent; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  /* Primary CTA — amber gradient matching every OCR button on the
     main site (see home.ejs and free-tamil-editor.ejs). Same gradient
     stops as the site's Handwriting OCR bento-card CTA. */
  .btn-primary { flex: 1; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
    color: #1E1B4B; font-weight: 700; font-size: 15px;
    box-shadow: var(--shadow-primary); padding: 14px 20px; }
  .btn-primary:hover:not(:disabled) { transform: translateY(-1px);
    box-shadow: 0 12px 28px rgba(245, 158, 11, 0.42), 0 2px 4px rgba(0,0,0,0.2); }
  .btn-primary:active:not(:disabled) { transform: translateY(0);
    box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3); }
  .btn-primary.success { background: linear-gradient(135deg, #10b981, #10b981);
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4); animation: pop 0.4s ease; }
  @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.03); } 100% { transform: scale(1); } }
  .btn-secondary { background: transparent; color: var(--muted); border: 1px solid var(--border);
    padding: 12px 14px; }
  .btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.04); color: var(--text); border-color: var(--muted); }
  .btn-icon { width: 18px; height: 18px; stroke: currentColor; stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round; fill: none; }
  .btn kbd { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 4px;
    background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.15); color: inherit;
    font-family: ui-monospace, "SF Mono", monospace; font-size: 11px; font-weight: 600;
    margin-left: 4px; opacity: 0.85; }
  .btn-secondary kbd { background: rgba(255,255,255,0.05); border-color: var(--border); color: var(--muted); }

  /* ── Processing state ("lock screen" treatment) ────────────
     The preview is dimmed + blurred behind a prominent floating
     card that dominates the column. Ring-progress with elapsed
     time in the middle communicates "actively working" at a
     glance, without the ambiguity of a horizontal bar. */
  .processing-wrap { position: relative; flex: 1; display: flex; align-items: center;
    justify-content: center; overflow: hidden; border-radius: var(--radius-sm);
    background: rgba(0,0,0,0.35); min-height: 260px; }
  .processing-wrap img { max-width: 100%; max-height: 100%; width: auto; height: auto;
    filter: blur(6px) brightness(0.35); transform: scale(1.06); transition: none;
    display: block; }
  .processing-card { position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    display: flex; flex-direction: column; align-items: center; gap: 18px;
    padding: 28px 36px; min-width: 240px; max-width: 90%;
    background: rgba(26, 23, 69, 0.88); backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 16px;
    box-shadow: 0 20px 60px rgba(245, 158, 11, 0.22),
                0 8px 24px rgba(0, 0, 0, 0.5),
                inset 0 1px 0 rgba(255,255,255,0.08);
    animation: cardIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes cardIn {
    from { opacity: 0; transform: translate(-50%, -46%) scale(0.94); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }

  /* Circular ring progress with elapsed time in the middle */
  .ring { position: relative; width: 96px; height: 96px; }
  .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .ring .track { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 6; }
  .ring .fill  { fill: none; stroke: url(#ringGrad); stroke-width: 6;
    stroke-linecap: round; stroke-dasharray: 264; stroke-dashoffset: 264;
    animation: ringSpin 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  @keyframes ringSpin {
    0%   { stroke-dashoffset: 264; transform: rotate(0deg); }
    50%  { stroke-dashoffset: 66;  transform: rotate(180deg); }
    100% { stroke-dashoffset: 264; transform: rotate(720deg); }
  }
  .ring svg .fill { transform-origin: 50% 50%; }
  .ring-timer { position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center; font-family: ui-monospace, "SF Mono", monospace;
    font-size: 22px; font-weight: 600; color: var(--text-strong);
    font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }

  .stage-label { font-size: 15px; color: var(--text-strong); font-weight: 600;
    text-align: center; line-height: 1.4; max-width: 240px; }
  .stage-sub { font-size: 12px; color: var(--muted); text-align: center; line-height: 1.5; }
  .cancel-btn { font-size: 12px; color: var(--muted); background: none; border: 1px solid var(--border);
    padding: 6px 14px; border-radius: 999px; cursor: pointer; transition: all 0.12s;
    font-family: inherit; font-weight: 500; }
  .cancel-btn:hover { color: var(--err); border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08); }

  /* Error banner — default display:none. setState toggles the actual
     display via .style.display, so no [hidden] attribute needed and
     no !important rule (which was fighting the .style.display=flex
     on readyState/processingState and leaving the whole column blank). */
  .error-banner { display: none; gap: 12px; padding: 14px; margin-bottom: 12px;
    background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3);
    border-left: 3px solid var(--err); border-radius: var(--radius-sm); }

  /* Validation banners — appear inline in the image column BEFORE
     any transcription starts. Two flavours:
       .validation-error  — blocking. Bad format, oversize, corrupt file.
                            Transcription does NOT auto-run.
       .validation-warn   — non-blocking. Low resolution etc. Auto-run
                            proceeds; user gets a heads-up. */
  .validation-banner { display: none; gap: 10px; padding: 10px 12px;
    margin-bottom: 12px; border-radius: var(--radius-sm); font-size: 13px;
    align-items: flex-start; line-height: 1.5; }
  .validation-error { background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3); border-left: 3px solid var(--err);
    color: #fca5a5; }
  .validation-warn { background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3); border-left: 3px solid var(--warn);
    color: #fcd34d; }
  .validation-banner .vb-icon { font-size: 16px; line-height: 1.2; flex-shrink: 0; }
  .validation-banner .vb-text b { color: var(--text-strong); }
  .error-icon-box { font-size: 20px; line-height: 1; flex-shrink: 0; }
  .error-content { flex: 1; min-width: 0; }
  .error-title { font-size: 13px; font-weight: 600; color: #fca5a5; margin-bottom: 4px; }
  .error-detail { font-size: 12px; color: var(--muted); font-family: ui-monospace, monospace;
    word-break: break-word; margin-bottom: 10px; }
  .error-actions { display: flex; gap: 6px; }
  .error-actions button { padding: 6px 12px; font-size: 12px; }

  /* ── Raw OCR column ─────────────────────────────────────── */
  #rawText { flex: 1; padding: 16px; overflow-y: auto; white-space: pre-wrap;
    font-family: "Latha", "Noto Sans Tamil", "Segoe UI", sans-serif;
    font-size: 15px; line-height: 1.7; color: var(--text); }
  #rawText.placeholder { color: var(--muted); font-style: italic; padding: 24px 16px; }
  #rawText .flagged { background: rgba(245, 158, 11, 0.14); border-bottom: 1.5px dashed var(--warn);
    padding: 0 2px; border-radius: 2px; cursor: help; }
  #rawText .rawWordApplied { background: rgba(16, 185, 129, 0.15); color: var(--ok);
    border-bottom: 1.5px solid var(--ok); padding: 0 2px; border-radius: 2px; font-weight: 600; }
  #meta { padding: 10px 16px; border-top: 1px solid var(--border); display: none;
    font-family: ui-monospace, "SF Mono", monospace; font-size: 11px; color: var(--muted);
    background: rgba(0,0,0,0.15); }
  #meta span { margin-right: 14px; }
  #meta .ok { color: var(--ok); }
  #meta .err { color: var(--err); }

  /* Copy button in the Raw OCR panel header.
     Copies exactly what the user sees (innerText of #rawText), so
     Applied suggestions are included — matches the on-screen text,
     not the original raw_text field. Disabled when nothing to copy. */
  .header-actions { display: flex; gap: 8px; align-items: center; }
  .btn-copy { padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--muted); font-size: 11px; font-weight: 700;
    cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
    transition: all 0.12s; text-transform: uppercase; letter-spacing: 0.06em;
    font-family: inherit; }
  .btn-copy:hover:not(:disabled) { background: rgba(255,255,255,0.05); color: var(--text);
    border-color: var(--muted); }
  .btn-copy:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-copy.copied { color: var(--ok); border-color: var(--ok);
    background: rgba(16, 185, 129, 0.1); animation: pop 0.35s ease; }
  .btn-copy svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 2;
    fill: none; stroke-linecap: round; stroke-linejoin: round; }

  /* ── Suggestions column ─────────────────────────────────── */
  #suggestions { flex: 1; padding: 8px; overflow-y: auto; }
  #suggestions.placeholder { padding: 24px 16px; color: var(--muted); font-style: italic; }
  /* Suggestion cards — purple left-border matches the AI Content
     Writer accent on the main site, signalling "AI-generated
     suggestion". Border-left color is the fastest visual cue for
     "this card has an AI proposal". */
  .card { background: var(--panel-2); border: 1px solid var(--border);
    border-left: 3px solid var(--purple); border-radius: var(--radius-sm);
    padding: 12px 14px; margin-bottom: 10px; transition: all 0.15s; }
  .card:hover { border-color: var(--purple-2); }
  .card .row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
    font-family: "Latha", "Noto Sans Tamil", sans-serif; font-size: 15px; }
  .card .raw-word { color: var(--warn); text-decoration: line-through; }
  .card .arrow { color: var(--muted); font-size: 13px; }
  .card .sug-word { color: var(--ok); font-weight: 600; }
  .card .reason { font-size: 12px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
  .card .conf-wrap { margin-top: 8px; display: flex; align-items: center; gap: 8px; }
  .card .conf-label { font-size: 10px; color: var(--muted); font-family: ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.05em; }
  .card .conf-bar { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .card .conf-fill { height: 100%; background: linear-gradient(90deg, var(--warn), var(--ok));
    transition: width 0.3s; }
  .card .context { font-size: 11px; color: var(--muted); margin-top: 8px;
    font-family: "Latha", "Noto Sans Tamil", sans-serif; opacity: 0.7; }
  .card .actions { display: flex; gap: 6px; margin-top: 10px; }
  .card button { flex: 1; padding: 6px 10px; border-radius: 6px; font-size: 12px;
    font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: transparent;
    color: var(--text); transition: all 0.12s; }
  .card button.apply { border-color: var(--ok); color: var(--ok); }
  .card button.apply:hover { background: var(--ok); color: #052e16; }
  .card button.reject { border-color: var(--muted); color: var(--muted); }
  .card button.reject:hover { background: var(--border); color: var(--text); }
  .card.applied { border-left-color: var(--ok); opacity: 0.75; }
  .card.applied button { display: none; }
  .card.applied::after { content: "✓ APPLIED"; font-size: 10px; color: var(--ok);
    display: block; margin-top: 8px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; }
  .card.rejected { border-left-color: var(--muted); opacity: 0.35; }
  .card.rejected button { display: none; }
  .card.rejected::after { content: "✗ IGNORED"; font-size: 10px; color: var(--muted);
    display: block; margin-top: 8px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; }

  /* Toast (non-blocking success feedback) */
  .toast { position: fixed; top: 20px; right: 20px; z-index: 100;
    display: flex; align-items: center; gap: 10px; padding: 12px 18px;
    background: var(--ok); color: #052e16; border-radius: var(--radius-sm);
    box-shadow: 0 10px 30px rgba(16, 185, 129, 0.35);
    font-weight: 600; font-size: 13px; transform: translateY(-8px); opacity: 0;
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); pointer-events: none; }
  .toast.show { transform: translateY(0); opacity: 1; }

  .keywarn { padding: 12px 24px; background: rgba(239, 68, 68, 0.1);
    border-bottom: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1><span class="dot"></span> OCR v2 · Verbatim + Suggestions</h1>
  <div class="header-right">
    <div class="mode-picker" role="tablist" aria-label="Pipeline mode">
      <button data-mode="baseline"     class="active" title="Single Gemini call on raw image (fastest)">Baseline</button>
      <button data-mode="preprocessed"                title="Deskew + contrast + resize before Gemini call">Preprocessed</button>
      <button data-mode="full"                        title="Preprocess + strip cutting + parallel transcribe (highest accuracy)">Full Pipeline</button>
    </div>
    <div class="badge">${MODEL}</div>
  </div>
</header>
${!API_KEY ? '<div class="keywarn">⚠️ No GEMINI_API_KEY / GOOGLE_GENAI_API_KEY found in env. Set it in the repo-root .env.local and restart this server.</div>' : ''}

<main>
  <!-- ── COLUMN 1: Image ────────────────────────────────── -->
  <section class="panel img-column">
    <div class="panel-header">
      <span>Image</span>
      <span id="fileMetaHeader" class="subtitle"></span>
    </div>
    <div class="img-body">

      <!-- Validation banners — appear inline for the current file.
           Blocking (error) suppresses auto-transcribe; warning does not. -->
      <div id="validationBanner" class="validation-banner">
        <div class="vb-icon" id="vbIcon">⚠️</div>
        <div class="vb-text" id="vbText"></div>
      </div>

      <!-- Error banner (shown only in error state) -->
      <div id="errorBanner" class="error-banner" hidden>
        <div class="error-icon-box">⚠️</div>
        <div class="error-content">
          <div class="error-title">Transcription failed</div>
          <div id="errorDetail" class="error-detail"></div>
          <div class="error-actions">
            <button id="btnRetry" class="btn btn-primary">↻ Retry</button>
            <button id="btnErrorReset" class="btn btn-secondary">Change image</button>
          </div>
        </div>
      </div>

      <!-- State: idle (no image) -->
      <label for="fileInput" id="dropZone" class="drop">
        <div class="drop-icon">📄</div>
        <div class="drop-title">Drop a Tamil image here</div>
        <div class="drop-hint">
          or click to browse<br>
          jpg · png · webp · heic · up to 20MB
        </div>
        <div class="drop-kbd">
          <kbd>⌘U</kbd> to browse anytime
        </div>
      </label>
      <input type="file" id="fileInput" accept="image/*" style="display:none" />

      <!-- State: ready (image loaded, awaiting transcribe).
           display:none initially — setState('ready') flips to flex. -->
      <div id="readyState" style="display:none; flex-direction:column; gap:12px; flex:1;">
        <div class="preview-wrap"><img id="preview" alt="preview" /></div>
        <div class="file-meta">
          <span id="filenameLabel" class="filename"></span>
          <span id="sizeLabel"></span>
        </div>
        <div class="actions-row">
          <button id="btnChange" class="btn btn-secondary" title="Choose a different image (⌘U)">
            <svg class="btn-icon" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Change
          </button>
          <button id="btnRun" class="btn btn-primary" title="Transcribe (Enter)">
            <svg class="btn-icon" viewBox="0 0 24 24"><path d="M12 2v6l4-4M12 8L8 4M4 12h6l-4-4M4 12l4 4M20 12h-6l4-4M20 12l-4 4M12 22v-6l4 4M12 16l-4 4"/></svg>
            Transcribe
            <kbd>↵</kbd>
          </button>
        </div>
      </div>

      <!-- State: processing (transcription in flight).
           Lock-screen treatment: preview blurred + dimmed behind a
           floating card with ring-progress + elapsed timer + stage
           label + cancel action. display:none default — setState
           toggles to flex. -->
      <div id="processingState" style="display:none; flex-direction:column; gap:12px; flex:1;">
        <div class="processing-wrap">
          <img id="preview2" alt="preview" />
          <div class="processing-card">
            <div class="ring">
              <svg viewBox="0 0 96 96">
                <defs>
                  <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%"   stop-color="#F59E0B" />
                    <stop offset="100%" stop-color="#D97706" />
                  </linearGradient>
                </defs>
                <circle class="track" cx="48" cy="48" r="42" />
                <circle class="fill"  cx="48" cy="48" r="42" />
              </svg>
              <div id="elapsed" class="ring-timer">0.0s</div>
            </div>
            <div id="stageLabel" class="stage-label">Uploading image…</div>
            <div class="stage-sub">Typical latency: 3–8 seconds per page</div>
            <button id="btnCancel" class="cancel-btn">✕ Cancel</button>
          </div>
        </div>
      </div>

    </div>
  </section>

  <!-- ── COLUMN 2: Raw OCR ──────────────────────────────── -->
  <section class="panel">
    <div class="panel-header">
      <span>Raw OCR <span class="subtitle">(verbatim)</span></span>
      <div class="header-actions">
        <span id="status" class="subtitle"></span>
        <button id="btnCopy" class="btn-copy" disabled title="Copy transcription to clipboard">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>
          Copy
        </button>
      </div>
    </div>
    <div id="rawText" class="placeholder">
      Drop an image on the left, then press <kbd style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 11px; border: 1px solid var(--border);">↵</kbd> or click Transcribe.
      <br><br>
      What appears here is exactly what the camera saw on the page — no auto-correction, no normalization. Suggestions (right panel) never modify this text; they only propose changes.
    </div>
    <div id="meta"></div>
  </section>

  <!-- ── COLUMN 3: Suggestions ──────────────────────────── -->
  <section class="panel">
    <div class="panel-header">
      <span>Suggestions <span id="sugCount" class="subtitle"></span></span>
      <span class="subtitle">apply / ignore per word</span>
    </div>
    <div id="suggestions" class="placeholder">
      When the model thinks a raw word may be misspelled or misread, it flags it here with a proposed correction and a confidence score. Click <b style="color: var(--ok)">✓ Apply</b> to patch the raw text, or <b style="color: var(--muted)">✗ Ignore</b> to keep the original.
    </div>
  </section>
</main>

<!-- Toast (success feedback) -->
<div id="toast" class="toast"></div>

<script>
  const els = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    readyState: document.getElementById('readyState'),
    processingState: document.getElementById('processingState'),
    errorBanner: document.getElementById('errorBanner'),
    preview: document.getElementById('preview'),
    preview2: document.getElementById('preview2'),
    filenameLabel: document.getElementById('filenameLabel'),
    sizeLabel: document.getElementById('sizeLabel'),
    fileMetaHeader: document.getElementById('fileMetaHeader'),
    btnRun: document.getElementById('btnRun'),
    btnChange: document.getElementById('btnChange'),
    btnCancel: document.getElementById('btnCancel'),
    btnRetry: document.getElementById('btnRetry'),
    btnErrorReset: document.getElementById('btnErrorReset'),
    stageLabel: document.getElementById('stageLabel'),
    elapsed: document.getElementById('elapsed'),
    errorDetail: document.getElementById('errorDetail'),
    rawText: document.getElementById('rawText'),
    suggestions: document.getElementById('suggestions'),
    meta: document.getElementById('meta'),
    status: document.getElementById('status'),
    sugCount: document.getElementById('sugCount'),
    toast: document.getElementById('toast'),
    btnCopy: document.getElementById('btnCopy'),
    validationBanner: document.getElementById('validationBanner'),
    vbIcon: document.getElementById('vbIcon'),
    vbText: document.getElementById('vbText'),
  };

  // Copy button — copies whatever is currently rendered in #rawText
  // (innerText, not innerHTML), so any Applied suggestions are
  // included in the copied text. That matches what the user sees.
  els.btnCopy.addEventListener('click', async () => {
    if (els.btnCopy.disabled) return;
    const text = els.rawText.innerText || '';
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      const original = els.btnCopy.innerHTML;
      els.btnCopy.classList.add('copied');
      els.btnCopy.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
      setTimeout(() => {
        els.btnCopy.classList.remove('copied');
        els.btnCopy.innerHTML = original;
      }, 1500);
    } catch (err) {
      showToast('Copy failed: ' + err.message, 'err');
    }
  });

  // ── State machine ─────────────────────────────────────────
  // idle → ready → processing → { success | error } → ready/idle
  let state = 'idle';
  let currentFile = null;
  let currentRaw = '';
  let sugList = [];
  let sugState = [];
  let abortCtrl = null;
  let stageInterval = null;
  let elapsedInterval = null;
  let startedAt = 0;

  // Pipeline mode — persisted in localStorage so refreshes stick.
  // Default 'baseline' for new visitors.
  let pipelineMode = (function () {
    try { return localStorage.getItem('ocr_v2_mode') || 'baseline'; }
    catch (_) { return 'baseline'; }
  })();
  document.querySelectorAll('.mode-picker button').forEach((btn) => {
    if (btn.getAttribute('data-mode') === pipelineMode) btn.classList.add('active');
    else btn.classList.remove('active');
    btn.addEventListener('click', () => {
      pipelineMode = btn.getAttribute('data-mode') || 'baseline';
      try { localStorage.setItem('ocr_v2_mode', pipelineMode); } catch (_) {}
      document.querySelectorAll('.mode-picker button').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  const STAGES = [
    { atMs:    0, label: 'Uploading image…' },
    { atMs: 1200, label: 'Analyzing page layout…' },
    { atMs: 3000, label: 'Transcribing Tamil text…' },
    { atMs: 6000, label: 'Detecting suggested corrections…' },
    { atMs: 12000, label: 'Still working — long pages take a bit…' },
    { atMs: 25000, label: 'Almost there…' },
  ];

  function setState(newState) {
    state = newState;
    els.dropZone.style.display        = (newState === 'idle')       ? 'flex' : 'none';
    els.readyState.style.display      = (newState === 'ready' || newState === 'success') ? 'flex' : 'none';
    els.processingState.style.display = (newState === 'processing') ? 'flex' : 'none';
    // Explicit display:flex/none — the [hidden] attribute alone can
    // lose to CSS display rules in some browsers.
    els.errorBanner.style.display     = (newState === 'error')      ? 'flex' : 'none';

    if (newState === 'idle') {
      els.fileMetaHeader.textContent = '';
      els.validationBanner.style.display = 'none';
      currentFile = null;
    }
    if (newState === 'processing') {
      // Hide validation warnings/errors during processing — they
      // apply to file selection, not to the in-flight request.
      els.validationBanner.style.display = 'none';
    }
    if (newState === 'success') {
      els.btnRun.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24"><path d="M12 2v6l4-4M12 8L8 4M4 12h6l-4-4M4 12l4 4M20 12h-6l4-4M20 12l-4 4M12 22v-6l4 4M12 16l-4 4"/></svg> Transcribe again <kbd>↵</kbd>';
    }
    if (newState === 'ready') {
      els.btnRun.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24"><path d="M12 2v6l4-4M12 8L8 4M4 12h6l-4-4M4 12l4 4M20 12h-6l4-4M20 12l-4 4M12 22v-6l4 4M12 16l-4 4"/></svg> Transcribe <kbd>↵</kbd>';
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function showToast(msg, tone) {
    els.toast.textContent = msg;
    els.toast.style.background = tone === 'err' ? 'var(--err)' : 'var(--ok)';
    els.toast.style.color = tone === 'err' ? '#fef2f2' : '#052e16';
    els.toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  // ── Validation ────────────────────────────────────────────
  // Runs on every file selection BEFORE we start a transcription.
  // Blocks bad inputs (wrong format, oversize, corrupt) with a clear
  // error message. Warns on suboptimal inputs (very low resolution)
  // but still proceeds — user's choice.
  const MAX_BYTES = 20 * 1024 * 1024;   // matches server multer limit
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  const ALLOWED_EXT   = /\.(jpe?g|png|webp|heic|heif)$/i;
  const MIN_SHORT_EDGE = 300;   // below this, OCR accuracy tanks
  const MAX_LONG_EDGE_WARN = 6000;

  function hideValidation() {
    els.validationBanner.style.display = 'none';
  }
  function showValidation(kind, iconHtml, textHtml) {
    els.validationBanner.className = 'validation-banner ' + (kind === 'error' ? 'validation-error' : 'validation-warn');
    els.vbIcon.textContent = iconHtml;
    els.vbText.innerHTML = textHtml;
    els.validationBanner.style.display = 'flex';
  }

  /**
   * Validate a File. Returns { ok, blocking, reason } where
   *   ok=true, blocking=false            → good to go
   *   ok=true, blocking=false, reason=X  → warning; proceed anyway
   *   ok=false, blocking=true, reason=X  → do NOT transcribe
   */
  async function validateFile(f) {
    if (!f) return { ok: false, blocking: true, reason: 'No file selected.' };

    // Type + extension check — belt AND braces since browser MIME
    // sniffing is unreliable (some drop empty type, some report
    // application/octet-stream for HEIC).
    const type = String(f.type || '').toLowerCase();
    const nameOk = ALLOWED_EXT.test(f.name || '');
    const typeOk = ALLOWED_TYPES.has(type);
    if (!nameOk && !typeOk) {
      return { ok: false, blocking: true,
        reason: '<b>Unsupported file format.</b> Please upload a <b>JPG</b>, <b>PNG</b>, <b>WebP</b>, or <b>HEIC</b> image.' };
    }

    // Size check — client-side rejection saves the multipart upload
    // trip if the file is oversize.
    if (f.size > MAX_BYTES) {
      return { ok: false, blocking: true,
        reason: '<b>File too large.</b> This file is ' + fmtSize(f.size) + '. Max is 20 MB.' };
    }
    if (f.size < 200) {
      return { ok: false, blocking: true,
        reason: '<b>File is too small</b> (' + f.size + ' bytes) — probably empty or corrupt.' };
    }

    // Try to actually load as an image + read its dimensions. Catches
    // corrupt files, wrong-labeled formats, HEIC (which most browsers
    // can\\'t preview) — we don\\'t block HEIC on preview failure because
    // the server-side sharp pipeline handles it fine.
    try {
      const dims = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(f);
        const img = new Image();
        const cleanup = () => URL.revokeObjectURL(url);
        img.onload  = () => { cleanup(); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = () => { cleanup(); reject(new Error('image failed to load')); };
        // Timeout in case the browser hangs on HEIC or a weird encoding
        setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 5000);
        img.src = url;
      });
      const shortEdge = Math.min(dims.w, dims.h);
      const longEdge  = Math.max(dims.w, dims.h);
      if (shortEdge > 0 && shortEdge < MIN_SHORT_EDGE) {
        return { ok: true, blocking: false,
          reason: '<b>Low resolution</b> (' + dims.w + '×' + dims.h + 'px). OCR accuracy will be lower. Recommended: at least ' + MIN_SHORT_EDGE + 'px on the short edge.' };
      }
      if (longEdge > MAX_LONG_EDGE_WARN) {
        return { ok: true, blocking: false,
          reason: '<b>Very large image</b> (' + dims.w + '×' + dims.h + 'px). It will be downscaled to 2200px long-edge before transcription.' };
      }
    } catch (_) {
      // HEIC often fails browser preview but server-side sharp reads it
      // fine — don\\'t block based on Image() failing. Just skip the
      // dimensions check for that file.
      if (type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/i.test(f.name || '')) {
        return { ok: true, blocking: false, reason: '' };
      }
      return { ok: false, blocking: true,
        reason: '<b>Corrupted or unreadable image.</b> Try re-exporting from your photos app or camera.' };
    }
    return { ok: true, blocking: false, reason: '' };
  }

  // ── File selection ────────────────────────────────────────
  async function setFile(f) {
    if (!f) return;
    currentFile = f;
    els.filenameLabel.textContent = f.name;
    els.sizeLabel.textContent = fmtSize(f.size);
    els.fileMetaHeader.textContent = f.name + ' · ' + fmtSize(f.size);
    const url = URL.createObjectURL(f);
    els.preview.src = url;
    els.preview2.src = url;
    setState('ready');
    // Reset transcription output on new file
    els.rawText.className = 'placeholder';
    els.rawText.innerHTML = 'Validating image…';
    els.suggestions.className = 'placeholder';
    els.suggestions.innerHTML = 'Waiting for transcription…';
    els.sugCount.textContent = '';
    els.meta.style.display = 'none';
    els.btnCopy.disabled = true;
    sugList = [];
    sugState = [];
    hideValidation();

    // Pre-flight validation — blocks transcription on hard errors,
    // warns (and continues) on soft ones like low resolution.
    const v = await validateFile(f);
    if (!v.ok && v.blocking) {
      showValidation('error', '⚠️', v.reason);
      els.rawText.innerHTML = 'Fix the validation issue on the left, then upload again.';
      currentFile = null;   // block auto-run and manual Transcribe
      return;
    }
    if (v.reason) {
      // Non-blocking warning — show but continue.
      showValidation('warn', '⚠️', v.reason);
    }

    // Auto-trigger transcription after a short pause so the user
    // sees "yes, that's my image" before it kicks off. If they realize
    // they picked the wrong file, they can hit Cancel in the processing
    // overlay OR press Esc — nothing is committed to the model until
    // the fetch actually fires.
    els.rawText.innerHTML = 'Auto-transcribing in a moment…';
    setTimeout(() => {
      // Only fire if user hasn't already changed image or clicked
      // Transcribe manually in the meantime (state !== 'processing').
      if (currentFile === f && state === 'ready') {
        transcribe();
      }
    }, 400);
  }

  els.fileInput.addEventListener('change', () => setFile(els.fileInput.files[0]));
  els.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropZone.classList.add('dragover'); });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragover'));
  els.dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); els.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });

  els.btnChange.addEventListener('click', () => els.fileInput.click());
  els.btnErrorReset.addEventListener('click', () => {
    els.fileInput.value = '';
    setState('idle');
  });

  // ── Transcription flow ────────────────────────────────────
  async function transcribe() {
    if (!currentFile || state === 'processing') return;
    setState('processing');
    startedAt = Date.now();
    els.status.textContent = 'in flight…';

    // Cycle stage labels based on elapsed time — fake but honest
    // (each label corresponds to a real phase in the server pipeline).
    els.stageLabel.textContent = STAGES[0].label;
    stageInterval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const current = STAGES.filter(s => s.atMs <= elapsed).pop();
      if (current) els.stageLabel.textContent = current.label;
    }, 300);
    elapsedInterval = setInterval(() => {
      const s = (Date.now() - startedAt) / 1000;
      els.elapsed.textContent = s.toFixed(1) + 's';
    }, 100);

    abortCtrl = new AbortController();
    try {
      const fd = new FormData();
      fd.append('image', currentFile);
      fd.append('mode', pipelineMode);
      const res = await fetch('/api/ocr?mode=' + encodeURIComponent(pipelineMode),
        { method: 'POST', body: fd, signal: abortCtrl.signal });
      const wallMs = Date.now() - startedAt;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));

      clearInterval(stageInterval); clearInterval(elapsedInterval);
      onSuccess(data, wallMs);
    } catch (err) {
      clearInterval(stageInterval); clearInterval(elapsedInterval);
      if (err.name === 'AbortError') {
        setState('ready');
        showToast('Cancelled', 'err');
      } else {
        onError(err.message || 'Unknown error');
      }
    } finally {
      abortCtrl = null;
    }
  }

  function onSuccess(data, wallMs) {
    currentRaw = data.raw_text || '';
    sugList = Array.isArray(data.suggestions) ? data.suggestions : [];
    sugState = sugList.map(() => 'pending');
    els.rawText.className = '';
    repaintRaw();
    repaintSuggestions();
    els.btnCopy.disabled = !currentRaw.trim();   // enable copy once we have text
    els.status.textContent = 'done';
    els.meta.style.display = 'block';
    const stageInfo = data.stages ? (function () {
      var s = data.stages;
      var parts = [];
      if (s.preprocessMs != null) parts.push('pre: <b>' + s.preprocessMs + 'ms</b>');
      if (s.stripCutMs   != null) parts.push('cut: <b>' + s.stripCutMs + 'ms</b>');
      if (s.stripCount   != null) parts.push('strips: <b>' + s.stripCount + '</b>');
      parts.push('gemini: <b>' + s.transcribeMs + 'ms</b>');
      return '<span>' + parts.join(' · ') + '</span>';
    })() : '';
    els.meta.innerHTML =
      '<span>mode: <b>' + (data.mode || 'baseline') + '</b></span>' +
      '<span>graphemes: <b>' + data.graphemes + '</b></span>' +
      '<span>suggestions: <b>' + sugList.length + '</b></span>' +
      stageInfo +
      '<span>total: <b>' + wallMs + 'ms</b></span>' +
      '<span>cost: <b>$' + (data.costUsd || 0).toFixed(4) + '</b></span>' +
      '<span class="ok">✓ ' + (data.model || '') + '</span>';
    setState('success');
    // Success flash on button
    els.btnRun.classList.add('success');
    const flashMsg = sugList.length > 0
      ? 'Done in ' + (wallMs / 1000).toFixed(1) + 's · ' + sugList.length + ' suggestion' + (sugList.length === 1 ? '' : 's')
      : 'Done in ' + (wallMs / 1000).toFixed(1) + 's · no corrections needed';
    setTimeout(() => els.btnRun.classList.remove('success'), 800);
    showToast(flashMsg);
  }

  function onError(msg) {
    els.errorDetail.textContent = msg;
    setState('error');
    els.status.innerHTML = '<span class="err">failed</span>';
    showToast('Transcription failed', 'err');
  }

  els.btnRun.addEventListener('click', transcribe);
  els.btnRetry.addEventListener('click', transcribe);
  els.btnCancel.addEventListener('click', () => {
    if (abortCtrl) abortCtrl.abort();
  });

  // ── Raw text + suggestions rendering ──────────────────────
  function repaintRaw() {
    const applied = new Map();
    const flagged = new Set();
    sugList.forEach((s, i) => {
      if (!s.raw_word) return;
      flagged.add(s.raw_word);
      if (sugState[i] === 'applied') applied.set(s.raw_word, s.suggested_word);
    });
    els.rawText.innerHTML = esc(currentRaw).split(/(\\s+)/).map((tok) => {
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
      els.suggestions.className = 'placeholder';
      els.suggestions.textContent = 'No suggestions — the model believes the raw transcription is accurate as-is.';
      els.sugCount.textContent = '(0)';
      return;
    }
    els.suggestions.className = '';
    const pending = sugState.filter((s) => s === 'pending').length;
    els.sugCount.textContent = '(' + pending + ' pending / ' + sugList.length + ' total)';
    els.suggestions.innerHTML = sugList.map((s, i) => {
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

  els.suggestions.addEventListener('click', (e) => {
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

  // ── Keyboard shortcuts ────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    // Enter (or Cmd+Enter) → transcribe
    if ((e.key === 'Enter' && !e.shiftKey) && !e.altKey && (state === 'ready' || state === 'success' || state === 'error') && currentFile) {
      // Ignore if user is typing in an input/textarea
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      transcribe();
    }
    // Cmd+U / Ctrl+U → open file picker
    if (mod && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      els.fileInput.click();
    }
    // Esc → cancel processing, or reset if idle-with-image
    if (e.key === 'Escape') {
      if (state === 'processing' && abortCtrl) {
        abortCtrl.abort();
      } else if (state === 'ready' || state === 'success' || state === 'error') {
        if (currentFile && confirm('Clear current image?')) {
          els.fileInput.value = '';
          setState('idle');
        }
      }
    }
  });

  // Initial state
  setState('idle');
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
  // Mode selection: baseline | preprocessed | full (defaults to baseline
  // for backwards compat with existing bookmarks/embeds).
  const modeRaw = String((req.query.mode ?? req.body.mode ?? 'baseline')).toLowerCase();
  const mode: PipelineMode =
    modeRaw === 'preprocessed' ? 'preprocessed' :
    modeRaw === 'full' ? 'full' :
    'baseline';

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-v2-'));
  const ext = path.extname(req.file.originalname || '.jpg') || '.jpg';
  const tmpPath = path.join(tmpDir, 'upload' + ext);
  try {
    await fs.writeFile(tmpPath, req.file.buffer);
    const r = await runPipeline(tmpPath, { mode, model: MODEL, apiKey: API_KEY });
    res.json({
      raw_text: r.raw_text,
      suggestions: r.suggestions,
      graphemes: graphemeCount(r.raw_text),
      wallMs: r.wallMs,
      costUsd: r.costUsd,
      model: MODEL,
      mode: r.mode,
      stages: r.stages,
      meta: r.meta,
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
