# Checkout 500 Error — Troubleshooting

When you see `Failed to create checkout session` with a 500 error, the backend is failing. After the latest update, the **actual error message** is now shown in the alert and in the browser console (`[payment.js] Checkout failed: ... — <details>`).

## 1. Check Backend Environment Variables (Cloud Run)

Ensure these are set in your **backend** (Cloud Run) deployment:

| Variable | Required for | Notes |
|----------|--------------|-------|
| `STRIPE_SECRET_KEY` | Stripe (global) | Starts with `sk_live_` or `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks | Starts with `whsec_` |
| `RAZORPAY_KEY_ID` | Razorpay (India) | Public key |
| `RAZORPAY_KEY_SECRET` | Razorpay (India) | Secret key |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhooks | |
| `BILLING_QUOTE_SECRET` | Quote signing | Any random string |
| `BILLING_SUCCESS_URL` | Redirect after payment | Default: `https://prooftamil.com/billing/success` |
| `BILLING_CANCEL_URL` | Cancel redirect | Default: `https://prooftamil.com/billing/cancel` |

**DodoPayments** (if used as primary):
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_SECRET`
- `DODO_ENVIRONMENT` (e.g. `production`)
- `DODO_PRODUCT_ID_INDIA`
- `DODO_PRODUCT_ID_GLOBAL`

## 2. Common Error Messages

| Error | Fix |
|-------|-----|
| `No such customer` | User's Stripe customer ID may be invalid; clear `stripe_customer_id` for the user in DB |
| `Invalid API Key` | Set `STRIPE_SECRET_KEY` correctly in Cloud Run |
| `plan not found` | Run migrations; ensure `plans` table has `PRO_MONTHLY` |
| `failed to calculate pricing` | Check `fx_rates` table has USD/INR rate; run billing migration |
| `failed to create stripe customer` | Stripe API key invalid or Stripe API down |

## 3. Check Backend Logs

In Google Cloud Console → Cloud Run → your backend service → **Logs**, look for:
- `[BILLING]` — billing flow
- `[STRIPE]` — Stripe operations
- `[AUTH]` — auth (401 vs 500)

## 4. "Unrecognized feature: loopback-network"

This is a **browser warning** from Stripe/Razorpay checkout.js, not the cause of the 500. It can be ignored.

## 5. Verify Auth

The checkout endpoint requires a valid `access_token` cookie. If you get **401 Unauthorized** instead of 500, the user is not logged in or the token expired. Try logging in again and retrying checkout.
