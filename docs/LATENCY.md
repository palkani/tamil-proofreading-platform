# Gemini Latency — Reality, Targets, and Plan

**Status:** v1 · **Written:** 2026-07-12

Marketing wants sub-1000ms. Physics says no — for full Gemini responses.
This doc explains what IS achievable, what isn't, and the concrete
sequence of optimizations to close the gap between the two.

---

## 1. The floor

Gemini generative APIs decode ~30-80 output tokens per second on Google's
serving infrastructure. Every request has three phases:

  1. Request → TLS round-trip → Google load balancer  ~100-300ms
  2. Model inference (input processing)               ~200-800ms
  3. Output decoding (token by token)                 ~30-80 tokens/sec

For a typical proofread of 50 Tamil words returning 6 corrections:
- Prompt in: ~1,500 tokens
- Output: ~400 tokens
- Total wall-clock: **~4-8s (flash-lite), 8-15s (flash), 15-40s (pro)**

**There is no known Gemini model that returns a full generative JSON
response in under 1 second for real proofreading input.**

Compare with alternatives:
- OpenAI GPT-4o mini: ~2-6s
- Anthropic Claude Haiku: ~2-5s
- Groq Llama-70b (specialty inference hosting): ~200-500ms, but no
  serious Tamil coverage

Sub-1000ms with a purpose-built local rule-based checker IS achievable,
but you lose:
- Context-aware semantic corrections (வலி vs வழி)
- Subtle grammar (subject-verb, aspect, negation forms)
- The Pro product's actual moat

---

## 2. Targets that ARE achievable

| Metric | Current | Achievable | How |
|---|---|---|---|
| Cache-hit response | 0ms (unmeasured) | **< 50ms** | proofreadCache already exists; hit rate is 0% — needs investigation |
| First-visible correction | 5-16s | **~1-2s** | Switch to `streamGenerateContent`, render corrections as they arrive |
| Full P95, flash-lite | ~8s | **~4-6s** | Trim maxOutputTokens (done 2026-07), keep prompt tight (done) |
| Full P95, flash | ~15s | **~8-12s** | Same + smaller retry-max on 503 |
| Full P95, pro | 16-30s | **~15-25s (unavoidable)** | This is pro's inference floor; nothing to do |
| Backend overhead only | ~200-500ms | **~100ms** | GORM save + audit log; not the bottleneck |

**The biggest UX win is streaming.** Users perceive the tool as fast when
the FIRST correction appears — even if the full analysis takes 10s.
"Waiting for suggestions" for 8s feels broken. "Watching suggestions
appear one at a time starting 1s in" feels responsive.

---

## 3. Plan — sequenced by impact/effort ratio

### 3.1 Ship now (already done in this commit)

- **Halve maxOutputTokens for short text** (llm_service.go line 203).
  Old: 1024/2048/4096/8192. New: 512/1024/2560/5120.
  Saves ~1.5-3s of decode time on the most common bucket
  (<800 chars, <150 words — where the bulk of workspace traffic sits).

### 3.2 High-impact quick wins (next 1-2 commits)

- **Diagnose 0% cache hit rate.** `proofreadCache` exists with 5-min TTL.
  It's showing 0% hits in the admin dashboard. Either:
  - Cache key is too strict (includes irrelevant fields)
  - TTL expires before repeat requests
  - Cache is per-instance and Cloud Run scales horizontally
  Fix: log cache lookups (key + hit/miss) for one day, then adjust.

- **Add localStorage-based client-side cache.** Even a 10-min cache of
  the last 5 proofread responses on the client would eliminate the
  "user hits refresh" and "user re-pastes the same text" scenarios.

### 3.3 Streaming (the big win)

- **Switch `generateContent` → `streamGenerateContent`.**
  Gemini's streaming endpoint yields tokens as they're generated
  (SSE format). Wire the SSE bytes back to the client through the
  existing `/api/corrections/stream` and `/api/v1/submissions/{id}/stream`
  paths. Parse partial JSON progressively — a JSON stream parser can
  detect complete correction objects as they close, and dispatch each
  one to the AI Assistant panel immediately.

  **First correction visible:** ~1-2s (currently 5-15s).
  **Total time:** unchanged (still 5-15s), but user perception is
  transformed.

  Effort: medium. Requires a streaming JSON parser + backend refactor
  of the Gemini call. Worth doing.

### 3.4 Model-selection tightening

- **Use flash-lite even for Pro users on very short text.** Currently
  Pro users get `flash` for short + `pro` for long. But 30-word Pro
  submissions wait 8-15s for the same corrections flash-lite gives in
  3-5s. Add a threshold: <30 words → flash-lite even for Pro users.
  Small quality difference on trivial text, big latency win.

### 3.5 Advanced (weeks of work; only if 3.1-3.4 aren't enough)

- **Gemini prompt caching.** Google recently added prompt-caching for
  fixed prefixes. Our 130-line proofreading prompt is a perfect fixed
  prefix — cache it as a system prompt, only send the user text as
  variable content. Reduces prompt-processing phase by ~50%.

- **Bloom-filter early-exit for clean text.** Before hitting Gemini,
  scan input for the top-500 most-common Tamil spelling errors via
  a local dictionary lookup. If nothing matches AND text is short,
  return "no corrections" in ~100ms with no Gemini call. Trades a
  small false-negative rate for a massive latency win on trivially-
  clean text.

- **Regional Gemini endpoints.** Google offers regional Vertex AI
  endpoints. Currently we hit `generativelanguage.googleapis.com`
  which routes through US. From asia-south1 Cloud Run, a Mumbai
  Vertex endpoint would shave ~150-300ms per call.

### 3.6 What NOT to do

- **Don't switch off Gemini.** The context-aware corrections are the
  product's competitive moat. Going back to a rule-based Tamil
  spell-checker for latency would gut the value prop.
- **Don't cache aggressively across users.** Different users typing
  the same sentence can want different corrections in different
  contexts. Cache MUST be keyed on (user, text, model) — never
  cross-user.
- **Don't parallelize multiple Gemini calls per submit.** Each Gemini
  call is billed. Parallel doesn't reduce time-per-call, only wall-
  clock at higher cost. Wrong lever.

---

## 4. Latency budgets by user perception

| User perception | Latency band | Achievable for |
|---|---|---|
| "Instant" | < 100ms | Cache hits, local rule-based |
| "Fast" | < 1s | Cache hits, first streamed token |
| "Responsive" | < 3s | First streamed correction |
| "Slow but working" | 3-10s | Flash / flash-lite full response |
| "Broken" | > 10s | Requires streaming to feel OK |

The current 16s P95 falls squarely in "broken" perception land, even
though the model is working correctly. Streaming (§3.3) moves users
from "broken" to "responsive" — the largest achievable perceptual win.

---

## 5. Measurement

Track these in the admin AI dashboard (`/admin/ai-requests`):
- P50/P95/P99 latency (already tracked, per model)
- Cache hit rate (currently shows 0% — needs investigation)
- Time-to-first-token (NEW — requires streaming to measure)
- Error/timeout rate

Set alert thresholds:
- P95 flash-lite > 8s     → investigate (should be 4-6s)
- P95 flash > 15s         → investigate (should be 8-12s)
- P95 pro > 30s           → investigate (should be 15-25s)
- Cache hit rate < 5% during peak → cache is broken; audit key

---

## 6. Bottom line

The "sub-1000ms" target for full response is not achievable with Gemini
today, and matches no serious LLM-based competitor either.

The **honest, defensible marketing claim** is:

> "First correction typically visible in under 2 seconds. Full analysis
> completes in 5-15 seconds depending on text length. Cached repeat
> responses return in under 100ms."

Ship §3.1 (done), §3.2 (this week), §3.3 (next 1-2 weeks) and this
becomes true. §3.5 is optional after that.
