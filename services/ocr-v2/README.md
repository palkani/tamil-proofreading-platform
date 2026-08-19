# OCR v2 — Phase 0: Benchmark Harness

Isolated Tamil handwriting OCR revamp. **Ships nothing to production yet.** Purpose of this phase: produce a real accuracy number for the current OCR approach, so every later phase (preprocessing, tiling, N-pass consensus, lexicon repair) has a measurable target to beat.

Lives under `services/ocr-v2/` and has zero code touching:

- Express middleware, routes, or auth (no risk to login, drafts, billing)
- The Go backend (no risk to submissions, /billing/me, admin)
- The current OCR maintenance page (users still see the clean "coming back soon" message)

## What ships in Phase 0

Just the harness — four files under `src/` and one CLI under `eval/`:

| File | Role |
|---|---|
| `src/tamil.ts` | Grapheme cluster splitting via `Intl.Segmenter`, NFC + ZWJ normalization, script routing (`tamil` / `latin` / `digit` / `punct`) |
| `src/metrics.ts` | CER (grapheme-cluster, not code-point), WER, catastrophic rate (% pages with CER > 30%), median + p95 |
| `src/transcribe.ts` | Baseline: single Gemini vision call on the whole image, no preprocessing. Matches what pre-maintenance OCR looked like |
| `eval/run-eval.ts` | CLI harness — iterates image/ground-truth pairs, runs the chosen config, emits CSV + JSON reports |

Why grapheme-cluster CER? Because Tamil letters like கூ are 1 letter (what the user sees) but 2 code points (க + ூ). Code-point CER over-counts every matra error and makes the numbers useless. The Devanagari OCR-VLM study (arXiv 2606.29213) is explicit that this alone shifts reported accuracies by 10-20 percentage points. Our metric module uses `Intl.Segmenter('ta', { granularity: 'grapheme' })` throughout.

Why median + catastrophic rate, not mean? The mean hides the rare total failure. One page in twenty coming back as gibberish is what actually kills the feature for users — and it's what disappears into a mean over 100 pages. We track P95 too so latency budget planning has a ceiling.

## Setup

```bash
cd services/ocr-v2
npm install
```

Set the API key in your shell or a local `.env` (loaded by tsx if present):

```bash
export GEMINI_API_KEY=<your Gemini key from Google AI Studio>
```

## Collecting the benchmark set

The single most important step in Phase 0 is a real, faithful benchmark of user handwriting. Target: 100 pages minimum. Aim for the distribution actual users upload — not synthetic clean pages.

Suggested mix:

| Slice | Count | Why |
|---|---|---|
| Neat adult handwriting on unruled paper | 20 | The easy case, sanity floor |
| Neat handwriting on ruled paper | 20 | Ruled lines cause deskew issues |
| Messy adult handwriting | 20 | The hard case, where accuracy lives |
| Student handwriting (school notes) | 20 | Real distribution — dominant user segment |
| Tanglish mixed content | 10 | Tests the script-routing prompt |
| Pencil / faded ink | 5 | Low-contrast edge |
| Marginal notes + arrows + diagrams | 5 | Layout stress |

For each image, produce a matching `.txt` ground-truth file in Tamil Unicode. Filename convention: same basename, different extension.

```
data/
├── images/
│   ├── page-001.jpg
│   ├── page-002.png
│   └── page-003.heic
└── ground-truth/
    ├── page-001.txt
    ├── page-002.txt
    └── page-003.txt
```

Ground-truth should be verbatim what's written on the page — including English words, numbers, and punctuation in their original scripts. Preserve line breaks and paragraph structure. Use `⟨?⟩` for illegible portions.

The `data/` directory is `.gitignore`d — real user handwriting stays on your laptop, not in the repo. When we productionize, we'll set up a zero-retention data store separately.

## Running the baseline

Smoke test first (3 pages, sanity check the pipeline works):

```bash
npm run eval:baseline:smoke
```

Full run:

```bash
npm run eval:baseline
```

Output goes to stdout and to `eval-results/baseline.{csv,json}`. Example:

```
───── baseline ─────
Pages:            100  (98 ok, 2 failed)
Median CER:       18.42%      Mean CER: 24.10%      P95 CER: 61.20%
Median WER:       35.10%      Mean WER: 42.00%
Catastrophic:     12.00%   (pages with CER > 30%)
Median latency:   4200ms   P95 latency: 8100ms
Total cost:       $0.5140
```

## What we're looking for from the baseline

The plan targets on the roadmap doc are:

| Metric | Baseline (unknown until we run) | Phase 4 target |
|---|---|---|
| Median CER, neat handwriting | ~8-15% (estimated) | < 3% |
| Median CER, messy handwriting | ~25-40% (estimated) | < 10% |
| Catastrophic rate | unknown | < 3% |

If the baseline is dramatically worse than the estimate, the preprocessing + strip pipeline in Phase 2-3 has more headroom than expected. If it's already close to target, we may skip 2-pass consensus entirely (cheaper).

## What Phase 0 is NOT

- Not the pipeline. That's Phase 2 (preprocessing + strips) and Phase 3 (consensus + validation).
- Not a Cloud Run service. That's Phase 1.
- Not user-facing. Nobody sees a change until Phase 2-beta.
- Not touching billing. Existing `handwriting_ocr_usages` table + quota middleware get reused in Phase 3.

## Phase 1+ additions to this repo

Coming under the same directory, matching the plan doc's structure:

```
src/
├── tamil.ts            ✓ ships in Phase 0
├── metrics.ts          ✓ ships in Phase 0
├── transcribe.ts       ✓ baseline in Phase 0; multi-provider in Phase 3
├── preprocess.ts       — Phase 2 (sharp: deskew, contrast, line detect, strip cut)
├── prompt.ts           — Phase 2 (structured JSON schema with block types)
├── reconcile.ts        — Phase 3 (Needleman-Wunsch alignment, per-word confidence)
├── postcorrect.ts      — Phase 4 (lexicon repair, grammar hook)
├── lexicon-loader.ts   — Phase 4 (load tamil_words from Postgres once on boot)
├── pipeline.ts         — Phase 2 orchestrator
└── server.ts           — Phase 1 Cloud Run HTTP server
eval/
├── run-eval.ts         ✓ ships in Phase 0
└── ablation.ts         — Phase 3+ (run every config over the same set)
```

## Escape hatch

At any point Phase 1-4 can be rolled back by:

1. Setting `OCR_V2_ENABLED=false` on Vercel + Cloud Run env
2. The maintenance page + 503 API gate are still wired — users see today's clean message

Nothing in this directory ever gets called from production until we flip that flag in Phase 2.
