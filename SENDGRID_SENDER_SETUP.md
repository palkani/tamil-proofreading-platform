# Fix: "The from address does not match a verified Sender Identity"

SendGrid only allows sending from **verified Sender Identities**. If you see:

```text
550 The from address does not match a verified Sender Identity. Mail cannot be sent until this error is resolved.
```

do the following.

## 1. Verify a sender in SendGrid

1. Log in to [SendGrid](https://app.sendgrid.com).
2. Go to **Settings** → **Sender Authentication**.
3. Choose one:
   - **Single Sender Verification**: Verify one email (e.g. `prooftamil@gmail.com`). Quick; use this if you’re fine sending from that address.
   - **Domain Authentication**: Verify `prooftamil.com` so any `*@prooftamil.com` (e.g. `noreply@prooftamil.com`) can be used. Better for production.

Complete the steps SendGrid shows (e.g. confirm the verification email for Single Sender, or add the DNS records for Domain Authentication).

## 2. Set the from address in your environment

The backend uses **`EMAIL_FROM_ADDRESS`** as the “From” address. It must be one of your **verified** senders.

**Option A – Single Sender (e.g. Gmail):**

- After verifying `prooftamil@gmail.com` in SendGrid, set:
  ```bash
  EMAIL_FROM_ADDRESS=prooftamil@gmail.com
  EMAIL_FROM_NAME=ProofTamil
  ```

**Option B – Domain (e.g. noreply@prooftamil.com):**

- After verifying the domain `prooftamil.com` in SendGrid, you can keep or set:
  ```bash
  EMAIL_FROM_ADDRESS=noreply@prooftamil.com
  EMAIL_FROM_NAME=ProofTamil
  ```

Set these in:

- **Local:** `.env` (or whatever env file your backend loads).
- **Cloud Run / production:** Project environment variables or Secret Manager, so the backend process has `EMAIL_FROM_ADDRESS` and (optionally) `EMAIL_FROM_NAME` set.

## 3. Restart and test

Restart the backend so it picks up the new env vars, then submit the contact form again. Mail should send without the 550 error.

## Reference

- [SendGrid Sender Identity](https://sendgrid.com/docs/for-developers/sending-email/sender-identity/)
- Backend reads: `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `SENDGRID_SMTP_PASSWORD`, `CONTACT_TO_EMAIL` (see `.env.example`).
