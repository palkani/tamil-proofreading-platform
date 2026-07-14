# AI Content Writer — Freemium Gating Plan

**Status:** v1 — Phase 1 shipping · **Written:** 2026-07-13

The AI Content Writer is currently a leaky bucket: fully public, no auth,
no rate limit, generating ~2500 output tokens per call at flash pricing.
This doc captures both the marketing rationale for gating it and the
phased implementation plan.

---

## 1. Marketing rationale

### Freemium funnel goals

| Stage | Who | What they see | Action pressure |
|---|---|---|---|
| Anonymous visit | Not logged in | Landing page + one-shot preview of what the tool produces (via curated sample outputs) | Signup wall on the first real generation |
| Logged-in Free | 2 generations per rolling week | Watermark badge: "1 of 2 free generations this week" | Hard paywall on 3rd attempt |
| Pro | Unlimited | No badge, priority queue, longer output | — |

### Why 2/week (not 1/day, not 5/month)

- **1/day (30/month)** — too generous, users never feel the friction that drives upgrades. Common freemium anti-pattern.
- **5/month** — feels arbitrary, no clear reset date users can plan around.
- **2/week** — the sweet spot. Enough for a real workflow (draft + revision), caps hard enough that heavy users hit the paywall within 4 days, and the weekly reset creates a predictable "your quota resets Monday" mental model.

### Loss aversion mechanics

Copy shown to Free users, in order of encounter:

1. **Before generation:** *"You have 2 free generations left this week."*
2. **After first:** *"1 of 2 left. Resets Monday."*
3. **After second:** *"0 of 2 left. Upgrade to Pro for unlimited, or come back in 4 days."*
4. **On 3rd attempt (paywall):** *"You've used your 2 free generations this week. Upgrade to Pro to keep going — unlimited generations, longer outputs, priority queue."*

Countdown text ("Resets in 3 days") outperforms static text ("Resets Monday") because it creates active urgency. Show whichever is more surprising: "Resets tomorrow" beats "Resets in 6 days".

### Conversion targets

Industry benchmark for content-tool freemium: **1-3%** of Free-quota-exhausted users upgrade. To improve:

- Show what Pro unlocks **on the paywall itself** (unlimited + templates + longer output + priority)
- Time-limited first-hit discount (50% off first month if upgrade within 1 hour of paywall)
- Draft persistence for Free users — makes them WANT to come back and finish
- Email trigger 24h after quota exhaustion ("You have work waiting — upgrade to finish it")

---

## 2. Technical design

### Quota semantics

- **Unit:** one successful generation = one quota unit consumed
- **Failure handling:** failed generations do NOT consume quota (write happens on success only)
- **Reset:** rolling ISO week starting Monday 00:00 UTC (avoids arbitrary user-timezone drift; Tamil users mostly in IST but backend clocks are UTC)
- **Storage:** `activity_events` table with `event_type = 'ai_content_writer_request'`. Same table + pattern as the proofreading quota system.

### Endpoints

**Backend Go — new:**
- `GET /api/v1/ai-content-writer/quota` (auth required)
  - Returns `{is_pro, used, limit, remaining, resets_at}`
  - Pro → `{is_pro: true, limit: 9999, remaining: 9999}` (client hides badge)
  - Free → counts `activity_events` since start of ISO week
- `POST /api/v1/ai-content-writer/consume` (auth required)
  - Writes an `activity_events` row with `event_type = 'ai_content_writer_request'`
  - Fire-and-forget from Express; not blocking

**Express — modified:**
- `POST /api/ai-content-writer/generate-content`
  - Add `authenticateJWT` middleware — 401 if no token
  - Before calling `contentWriterService.generateContent`:
    - `GET quota` from backend
    - If `!is_pro && remaining === 0` → return 402 with quota payload
  - On success → fire-and-forget `POST consume`
- Same treatment for `improve-content`, `translate`, `social-variants` (all cost Gemini calls)
- `render-blog-template` stays public (deterministic HTML render, no LLM)
- `health` stays public

### Anonymous UX

Public page `/tools/ai-content-writer` continues to render for SEO. On Submit:
1. If not logged in → intercept + open signup modal with copy: *"Sign up free to generate — 2 pieces per week, no credit card."*
2. After signup → redirect back to the tool with prompt preserved (localStorage draft)

This preserves SEO indexing (page is public), preserves the taste (form + settings visible), and gates only the LLM call itself.

---

## 3. Phased implementation

### Phase 1 — Foundation (this commit)

**Backend Go:**
- Add `EventAIContentWriterRequest` to `models/analytics.go`
- Add `GET /api/v1/ai-content-writer/quota` handler
- Add `POST /api/v1/ai-content-writer/consume` handler

**Express:**
- Wrap `/api/ai-content-writer/generate-content` with `authenticateJWT`
- Add quota-check-before-generate + consume-on-success

**Frontend (minimal):**
- Handle 401 → show signup prompt
- Handle 402 → show paywall message inline
- Show quota badge on page load if logged in and Free

Ship this. Verify quota decrements correctly across a real Free session.

### Phase 2 — Conversion UX (next commit if Phase 1 sticks)

- Polished paywall modal (not inline text) with plan comparison
- Countdown text ("Resets in 3 days") instead of static date
- Time-limited discount CTA on paywall hit
- Anonymous prompt preservation via localStorage (survive signup redirect)
- Extend gating to `improve-content` and `translate`

### Phase 3 — Nurture (only after Phase 1+2 metrics show baseline conversion)

- Email 24h after quota exhaustion
- A/B test paywall copy variants
- Admin dashboard tab showing weekly quota hit rate + conversion rate
- Draft persistence per Free user (2 saved drafts)

### Phase 4 — Optimizations (deferred)

- Atomic reserve/refund instead of check-then-consume (eliminates the tiny race where a Free user could double-tap and consume 3)
- Per-tier model routing (Pro users get flash for long content instead of flash-lite)
- Content Writer analytics dashboard

---

## 4. Metrics to watch after Phase 1

- **Signup conversion:** anonymous visitors → signup rate on the AI writer page (baseline before + after)
- **Paywall hit rate:** how many Free users hit their 2/week cap
- **Upgrade conversion:** paywall hit → Pro upgrade within 7 days
- **Cost per Free user:** Gemini spend / logged-in Free users using the tool

Set alerts:
- If <5% of Free users hit the paywall in the first month → limit is too generous
- If >30% of Free users hit the paywall AND upgrade conversion stays <1% → paywall UX is broken, not the limit

---

## 5. Non-goals for Phase 1

- Team plan quota sharing (deferred to team plan spec)
- Custom quota per user (admin-set overrides beyond the existing `PremiumOverride` flag)
- Different quotas per content type (blog vs essay vs story)
- Anonymous "one free taste" without signup (rejected — abuse vector via IP hopping is high, and the aha-moment for LLM-generated content is genuinely non-obvious without seeing the output tailored to your prompt)
