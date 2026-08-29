# Backend contract — promo/activation codes for custom pricing

Frontend shipped: `/pricing` no longer publishes rate cards. Users see
**"Request a custom quote"** + **"Have an activation code?"** input.
Entering a code validates via `POST /api/promo-code/validate` (Express
proxy → Go backend), which reveals a locked-in plan summary with a
"Continue to secure checkout" button that hands off to Dodo with the
code attached.

Interim state until backend ships §1 and §2 below: Express returns
`501 { valid: false }` from `/api/promo-code/validate`; the UI shows
a friendly *"Codes are not active yet, request a custom quote above"*
message. Nothing breaks; nobody can accidentally check out at a wrong
price. Free tier is unaffected.

## 1. `POST /api/v1/billing/promo-code/validate`

Called by the Express proxy at `/api/promo-code/validate` on every
"Apply" click on the pricing page.

Request:
```json
{ "code": "VIKATAN-Q3", "country_code": "IN" }
```

Success response (200):
```json
{
  "valid": true,
  "plan": {
    "plan_code":        "PROMO_VIKATAN_Q3",
    "label":            "Vikatan Publishing — Q3 pilot",
    "price_cents":      59900,
    "display_price":    "599",
    "currency":         "INR",
    "billing_interval": "month",
    "entitlements":     ["proofreading", "export"],
    "recurring_terms":  "Billed monthly. Cancel anytime — access continues until the end of your current period."
  }
}
```

Failure responses:

| Status | body                                      | UI behaviour |
|--------|-------------------------------------------|--------------|
| 400    | `{ valid: false, error: "code_required" }` | Enter your activation code. |
| 404    | `{ valid: false, error: "code_not_found" }` | "That code is not valid or has expired." |
| 409    | `{ valid: false, error: "code_exhausted" }` | Same as above (don't leak whether it's exhausted vs invalid). |
| 410    | `{ valid: false, error: "code_expired" }`  | Same. |
| 501    | `{ valid: false, error: "not_implemented" }` | "Codes aren't active yet — contact us." (Express returns this itself if backend hasn't shipped the endpoint.) |

Security notes:
- Rate-limit per IP: 10 validation attempts / minute.
- Do not leak whether a code exists but is expired vs. never existed —
  same 404 for both. Prevents enumeration.
- Validation is READ-ONLY — no side effects. Redemption happens at
  checkout (§3) when Dodo webhook confirms payment.

## 2. `promo_codes` table

```sql
CREATE TABLE promo_codes (
  code                 TEXT PRIMARY KEY,          -- e.g. "VIKATAN-Q3" (case-insensitive lookup)
  label                TEXT NOT NULL,             -- customer-visible: "Vikatan Publishing — Q3 pilot"
  entitlements         JSONB NOT NULL,            -- ["proofreading", "ocr", "export", "ai_writer"] (any subset)
  plan_code            TEXT NOT NULL,             -- Dodo plan code — usually a "PROMO_*" pattern
  price_cents          INT NOT NULL,              -- 59900 (₹599.00) — the actual price this code activates
  currency             TEXT NOT NULL,             -- 'INR' | 'USD' | 'EUR' | …
  billing_interval     TEXT NOT NULL,             -- 'month' | 'year' | 'one_time'
  max_redemptions      INT,                       -- null = unlimited
  redemption_count     INT NOT NULL DEFAULT 0,
  starts_at            TIMESTAMPTZ,               -- null = usable immediately
  expires_at           TIMESTAMPTZ,               -- null = never expires
  active               BOOLEAN NOT NULL DEFAULT true,
  internal_notes       TEXT,                      -- admin-only, never sent to client
  created_by_user_id   UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON promo_codes (lower(code));
CREATE INDEX ON promo_codes (created_at DESC);

CREATE TABLE promo_code_redemptions (
  id                   BIGSERIAL PRIMARY KEY,
  code                 TEXT NOT NULL REFERENCES promo_codes(code),
  user_id              UUID NOT NULL,
  subscription_id      UUID,                      -- filled by Dodo webhook once subscription created
  redeemed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON promo_code_redemptions (code);
CREATE INDEX ON promo_code_redemptions (user_id);
```

Validation logic:
```
SELECT * FROM promo_codes
WHERE lower(code) = lower($1)
  AND active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (expires_at IS NULL OR expires_at > now())
  AND (max_redemptions IS NULL OR redemption_count < max_redemptions);
```

Backend converts `price_cents` + `currency` to `display_price`
(₹599, $12.00) using the same normalisation as the rest of `/billing/pricing`.

## 3. Extend `POST /api/v1/billing/checkout`

Current shape (unchanged for non-promo checkouts):
```json
{ "plan_code": "PRO_MONTHLY", "country_code": "IN" }
```

New optional field:
```json
{
  "plan_code":   "PROMO_VIKATAN_Q3",
  "country_code": "IN",
  "promo_code":  "VIKATAN-Q3"
}
```

When `promo_code` is present, backend must:
1. Re-validate the code server-side (never trust that the client
   validated it — someone can call this endpoint directly with a
   made-up promo code + fake plan).
2. Create the Dodo subscription at the price/interval from the
   `promo_codes` row (NOT the plan_code's default price).
3. Insert a `promo_code_redemptions` row.
4. Increment `redemption_count` atomically.
5. Persist `entitlements` from the code onto the subscription so
   `billing/me` returns them for this user.
6. Return the same `{ checkout_url }` shape as today.

If re-validation fails (code expired between /validate and /checkout,
or the code+plan_code don't match), respond 409 and Express surfaces
the error to the user cleanly.

## 4. Feed the entitlements into `/api/v1/billing/me`

Already documented in `PRO_TIERS_BACKEND_CONTRACT.md` (this file's
sibling). Reminder: a subscription created via a promo code has its
`entitlements` populated from the code row, so `billing/me` returns
exactly what the code granted.

For the BC guarantee (existing subscribers, no entitlements field
yet), see `lib/entitlements.js` in the frontend — no change needed
here beyond populating the field for NEW subscriptions.

## 5. Admin CRUD for promo codes (frontend can build after §2 ships)

Endpoints backend should add for the admin console:

- `GET  /api/v1/admin/promo-codes?q&active&page&limit` — list
- `POST /api/v1/admin/promo-codes` — create
  ```json
  {
    "code": "VIKATAN-Q3",
    "label": "Vikatan Publishing — Q3 pilot",
    "entitlements": ["proofreading", "export"],
    "price_cents": 59900,
    "currency": "INR",
    "billing_interval": "month",
    "max_redemptions": 25,
    "starts_at": null,
    "expires_at": "2026-12-31T23:59:59Z",
    "internal_notes": "Vikatan pilot — see contract signed 2026-08-20"
  }
  ```
- `PATCH /api/v1/admin/promo-codes/:code` — update mutable fields
- `POST  /api/v1/admin/promo-codes/:code/deactivate` — flip active=false
- `GET   /api/v1/admin/promo-codes/:code/redemptions` — audit

Frontend UI I'll build in a follow-up session once these exist:
`/admin/promo-codes` list with create/edit modal + per-code
redemption panel. Follows the same pattern as
[views/pages/admin/audit.ejs](express-frontend/views/pages/admin/audit.ejs).

## 6. Least-privilege gates already shipped on frontend

Whenever a paid user visits a page for a feature not in their
`entitlements`, they get [views/pages/plan-blocked.ejs] instead of
the tool. Currently applied on:

- `/tools/handwriting-ocr` — Pro plans without `ocr` are blocked.

Not yet applied (add in follow-up when high-value):
- `/tools/ai-content-writer` — same pattern with `ai_writer`
- Workspace toolbar's Export button — hide when `!hasFeature('export')`
- Home page CTA cards for features the current user can't access

Free users (no paid plan) are never blocked by these gates — they
always get free-tier access. The block only fires when the user
explicitly bought a plan that doesn't include the feature, so the
UI doesn't nag a paying customer for a second upgrade.

## Rollout order

1. Ship `promo_codes` table + `POST /api/v1/billing/promo-code/validate`
   (§1 + §2). Express /pricing starts working end-to-end.
2. Extend `/api/v1/billing/checkout` to accept `promo_code` (§3).
   Actual paid activations start working.
3. Populate `entitlements` on new subscriptions (§4). Least-privilege
   gates start enforcing.
4. Ship admin CRUD (§5). Ops can create codes without touching SQL.

Steps 1-3 are the critical path. Step 4 is quality-of-life for ops
and can happen anytime after §2.
