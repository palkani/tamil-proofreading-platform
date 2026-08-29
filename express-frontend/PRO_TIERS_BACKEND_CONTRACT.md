# Backend contract — Pro Lite tiers + entitlements

**Shipped in the frontend** (`lib/entitlements.js`, `pricing.ejs`,
gates in `middleware/ocrMonthlyLimit.js` + `routes/api.js`):

- Two new plans on the pricing page — **Pro Proofreading Lite** and
  **Pro OCR Lite** — with checkout buttons wired to plan codes
  `PRO_PROOFREAD_LITE_MONTHLY / _YEARLY` and `PRO_OCR_LITE_MONTHLY /
  _YEARLY`.
- A `hasFeature(billing, feature)` helper that replaces every raw
  `billing.is_premium` check across the Express side.
- Backward-compat guarantee: existing Full-Pro subscribers (who have
  `is_premium: true` and no `entitlements` field) get every feature —
  nobody loses access when this deploys.

## Backend changes required for the Lite tiers to actually work

Until you ship the two changes below, users CAN buy the Lite plans via
the pricing page checkout, but the frontend gates will treat them as
Full Pro (BC path). No entitlement restriction is enforced. That's a
safe interim state — no user is over-charged and no free user gets
premium features — but it also means the Lite tiers aren't yet
selling what they promise.

### 1. Extend `/api/v1/billing/me` response with `entitlements`

Current response (kept, still populated for BC):
```json
{ "billing": { "is_premium": true, "plan_code": "PRO_MONTHLY", "current_period_end": "…" } }
```

New response — add `entitlements: string[]`:
```json
{ "billing": {
    "is_premium": true,
    "plan_code": "PRO_PROOFREAD_LITE_MONTHLY",
    "entitlements": ["proofreading", "export", "ai_writer"],
    "current_period_end": "…"
} }
```

Mapping — implement on the backend:

| plan_code                                  | entitlements                                             |
|--------------------------------------------|----------------------------------------------------------|
| `PRO_MONTHLY` / `PRO_YEARLY`               | `["proofreading", "ocr", "export", "ai_writer"]`         |
| `PRO_PROOFREAD_LITE_MONTHLY` / `_YEARLY`   | `["proofreading", "export", "ai_writer"]`                |
| `PRO_OCR_LITE_MONTHLY` / `_YEARLY`         | `["ocr"]`                                                |
| any other paid plan (unknown)              | `["proofreading", "ocr", "export", "ai_writer"]` (safe default) |
| free / no subscription                     | omit the field entirely (or `[]`)                        |

**Backfill for existing subscribers**: run a one-off migration that sets
`entitlements = ["proofreading", "ocr", "export", "ai_writer"]` on every
row where `plan_code IN ('PRO_MONTHLY', 'PRO_YEARLY')` and
`status = 'active'`. This is defence-in-depth — the frontend's BC path
already returns true for a missing entitlements field, so this backfill
is optional but preferred (makes the DB the source of truth instead of
relying on frontend inference).

### 2. Create the four new plan codes in Dodo Payments + backend

- `PRO_PROOFREAD_LITE_MONTHLY`
- `PRO_PROOFREAD_LITE_YEARLY`
- `PRO_OCR_LITE_MONTHLY`
- `PRO_OCR_LITE_YEARLY`

Suggested pricing (frontend fallback if backend doesn't return one):

| Plan                              | India (INR) | Rest of world (USD) |
|-----------------------------------|-------------|---------------------|
| Full Pro monthly (unchanged)      | ₹1000       | $12.00              |
| Full Pro yearly (unchanged)       | ₹9599       | $115.20             |
| Proofreading Lite monthly         | ₹599        | $7.00               |
| Proofreading Lite yearly          | ₹5750       | $69.00              |
| OCR Lite monthly                  | ₹599        | $7.00               |
| OCR Lite yearly                   | ₹5750       | $69.00              |

Both `/api/v1/billing/pricing?plan_code=PRO_PROOFREAD_LITE_MONTHLY`
and the checkout flow (`POST /api/v1/billing/checkout` with the new
codes) need to accept and price these correctly. The Dodo product IDs
map 1:1 to plan_code; add them in your Dodo dashboard and the backend
should be able to serve pricing without further code changes.

### 3. Server-side feature gates (defence in depth)

The frontend enforces entitlements on:
- OCR pipeline quota (`middleware/ocrMonthlyLimit.js`)
- Document export (`routes/api.js` DOCX/PDF/TXT handler)

These are client-facing gates. The backend should also enforce
entitlements on:
- `/api/v1/submit` (proofreading) — if plan lacks `proofreading` and
  the request exceeds the Free tier's daily quota, respond 402 with
  `{ error: "proofreading_not_in_plan" }`.
- Any /api/v1/ocr/* endpoint (if backend has its own OCR path) — if
  plan lacks `ocr`, respond 402 with `{ error: "ocr_not_in_plan" }`.

Same `hasFeature` semantics on the backend: missing entitlements
field + `is_premium: true` = grant everything (BC).

## Test matrix — verify before removing BC path

Once the backend is populating `entitlements`, run these end-to-end
against a test account for each plan:

| User plan                    | Try OCR                        | Try >200-word proofread       | Try DOCX export              |
|------------------------------|--------------------------------|-------------------------------|------------------------------|
| Free                         | 429 after 1/mo                 | Blocked at free quota         | 402 export_not_in_plan       |
| Existing Full Pro (no entitlements) | 429 after 20/mo         | Unlimited                     | Downloads OK                 |
| New Full Pro (`ocr`+all)     | 429 after 20/mo                | Unlimited                     | Downloads OK                 |
| Pro Proofreading Lite        | 429 after 1/mo (Free quota)    | Unlimited                     | Downloads OK                 |
| Pro OCR Lite                 | 429 after 20/mo                | Blocked at free quota         | 402 export_not_in_plan       |

Row 2 is the critical BC check — an existing Pro subscriber whose
backend record was created BEFORE the entitlements column existed
must continue to get everything. The frontend `hasFeature()` helper
handles this by returning true when `entitlements` is not an array,
but you should also verify the backend backfill (§1) does the same.

## Rollback plan

If the Lite tiers are causing issues after launch:
1. Disable the two Lite checkout buttons on `pricing.ejs` (comment out
   the two `<button onclick="startCheckout('PRO_PROOFREAD_LITE_MONTHLY'…">`
   handlers; the cards can stay for messaging or be hidden entirely).
2. In Dodo, mark the four new plan codes as inactive so no new
   subscriptions can be created.
3. Existing Lite subscribers keep their access until end of period;
   they can be migrated to Full Pro or refunded on request.

The frontend gates continue to work identically — a Lite subscriber
whose plan_code becomes unavailable still has their `entitlements`
array, so `hasFeature()` returns the same result as before.

## Nothing here breaks existing users

Every existing Full-Pro subscriber:
- Backend response unchanged until backfill runs
- `hasFeature()` returns true for every feature via the BC early-return
- Sees the same experience they saw yesterday

Every free user:
- No change — `is_premium: false` still fails the first `hasFeature`
  check → free-tier behaviour throughout.
