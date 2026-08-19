# Enterprise Backend Contract (Tier 1)

This document defines the Go backend surface the Express frontend expects
for the Tier 1 enterprise/team features (Organizations, Members, Invites,
Seats, Roles). The Express side is built to this contract; wiring is
mocked while the backend is being implemented.

Status: **DRAFT — implement in the Go backend repo.** Until endpoints
ship, the Express side falls back to mock responses in
`lib/enterprise/mockApi.js` when `ENTERPRISE_MOCK_MODE=true` is set.

## 1. Database schema (Supabase Postgres)

```sql
-- Organizations: the tenant boundary. One row per customer account.
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,                 -- URL-safe, unique
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id),
  seat_count      INT NOT NULL DEFAULT 1,               -- purchased seats
  plan_code       TEXT NOT NULL DEFAULT 'team_monthly', -- Dodo plan code
  dodo_subscription_id TEXT,
  data_retention_days  INT,                             -- null = default (30)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON organizations (owner_user_id);
CREATE INDEX ON organizations (slug);

-- Members: many users per org, one role per user per org.
-- A user CAN be in multiple orgs (freelance editors, agencies).
CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner','editor','reader')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX ON organization_members (user_id);

-- Invites: pending, expiring; single-use.
CREATE TABLE organization_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('editor','reader')),
  token           TEXT UNIQUE NOT NULL,                  -- 32-byte URL-safe
  invited_by      UUID NOT NULL REFERENCES auth.users(id),
  expires_at      TIMESTAMPTZ NOT NULL,                  -- 7 days default
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_invite_per_email
  ON organization_invites (organization_id, LOWER(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Onboarding progress: which of the 4 steps has each new org completed.
-- Delete when done or after 90 days idle.
CREATE TABLE onboarding_progress (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  step_named      BOOL NOT NULL DEFAULT false,
  step_invited    BOOL NOT NULL DEFAULT false,
  step_tried      BOOL NOT NULL DEFAULT false,
  step_exported   BOOL NOT NULL DEFAULT false,
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add org_id to existing user-owned content so it can be shared across
-- a team. Nullable = personal item (existing single-user behaviour).
ALTER TABLE drafts ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE ai_content_drafts ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX ON drafts (organization_id) WHERE organization_id IS NOT NULL;
```

Row-level security recommended on Supabase — every SELECT/INSERT on
drafts must satisfy `organization_id IS NULL OR user_is_member(organization_id)`.

## 2. Role capabilities

| Capability | Owner | Editor | Reader |
|---|:---:|:---:|:---:|
| Use grammar/spelling/transliteration | ✓ | ✓ | ✓ (own drafts only) |
| Use OCR (subject to org seat limit) | ✓ | ✓ | — |
| Use AI content writer | ✓ | ✓ | — |
| Create + edit org drafts | ✓ | ✓ | — |
| View + comment on org drafts | ✓ | ✓ | ✓ |
| Export org drafts as PDF/Word | ✓ | ✓ | ✓ |
| Invite members | ✓ | — | — |
| Change member roles | ✓ | — | — |
| Remove members | ✓ | — | — |
| Change org name / settings | ✓ | — | — |
| Manage billing + seat count | ✓ | — | — |
| Delete organization | ✓ (with double confirm) | — | — |

Note: an org can have multiple Owners (co-founder situations) but must
always have at least one — the last-Owner check runs on demote/remove.

## 3. API endpoints (all under `/api/v1/`, JSON, JWT-authed)

### 3.1 Read own org membership

`GET /api/v1/me/organizations`

Returns the orgs the signed-in user belongs to.

```json
{
  "organizations": [
    { "id": "uuid", "name": "Vikatan Publishing", "slug": "vikatan",
      "role": "editor", "seat_count": 25, "member_count": 12 }
  ]
}
```

### 3.2 Create an organization

`POST /api/v1/organizations`

Body:
```json
{ "name": "Vikatan Publishing", "slug": "vikatan" }
```

Response 201:
```json
{ "id": "uuid", "name": "Vikatan Publishing", "slug": "vikatan",
  "owner_user_id": "uuid", "seat_count": 1, "plan_code": "team_monthly" }
```

Errors: 409 if slug taken.

Creates the org, inserts the caller as `owner`, seeds
`onboarding_progress` row, and emits a `[ORG-CREATED]` audit log.

### 3.3 Get one org

`GET /api/v1/organizations/:id`

Response includes all fields from the row + `member_count`, `pending_invite_count`, `seats_used`, `seats_available`.

Requires membership. Editors + Readers get the same payload as Owners
(no billing secrets in this response — those live in a separate endpoint).

### 3.4 Update org settings (Owner only)

`PATCH /api/v1/organizations/:id`

Body (all optional):
```json
{ "name": "New name", "data_retention_days": 90 }
```

### 3.5 List members

`GET /api/v1/organizations/:id/members`

Response:
```json
{
  "members": [
    { "user_id": "uuid", "email": "founder@vikatan.com",
      "name": "R. Kumar", "role": "owner", "joined_at": "..." },
    ...
  ]
}
```

Editors + Readers can list (they need to know who they're collaborating
with). Owners see the same list.

### 3.6 Change a member's role (Owner only)

`PATCH /api/v1/organizations/:id/members/:userId`

Body: `{ "role": "editor" }`

Rejects (409) if it would leave the org with zero Owners.

### 3.7 Remove a member (Owner only)

`DELETE /api/v1/organizations/:id/members/:userId`

Rejects (409) if it would remove the last Owner.
User's org-scoped drafts remain (they don't get deleted — org keeps them).
User's personal drafts (org_id NULL) are unaffected.

### 3.8 Create an invite (Owner only)

`POST /api/v1/organizations/:id/invites`

Body:
```json
{ "emails": ["a@x.com", "b@y.com"], "role": "editor" }
```

For each email:
- If already a member → skip (return in `skipped[]`)
- If an active invite exists → skip
- If `seats_used + pending_invites + new_invites > seat_count` → 402 with `error:"seat_limit"` and no invites written
- Otherwise: insert row, generate token, dispatch email via Resend/SendGrid with a link to `https://prooftamil.com/invite/:token`

Response 201:
```json
{ "created": [ { "id": "uuid", "email": "a@x.com" }, ... ],
  "skipped": [ { "email": "b@y.com", "reason": "already_member" } ] }
```

### 3.9 List pending invites

`GET /api/v1/organizations/:id/invites?status=pending`

`status` = `pending` | `accepted` | `revoked` | `all` (default: `pending`).

### 3.10 Revoke an invite (Owner only)

`DELETE /api/v1/organizations/:id/invites/:inviteId`

Sets `revoked_at = now()`. Token is immediately unusable.

### 3.11 Look up an invite by token (public, no auth)

`GET /api/v1/invites/:token`

Response:
```json
{ "organization": { "name": "Vikatan Publishing", "slug": "vikatan" },
  "email": "a@x.com", "role": "editor",
  "expires_at": "2026-09-01T00:00:00Z",
  "status": "pending" }
```

404 if unknown token · 410 if expired or revoked · 409 if already accepted.

Never returns the org's member list or any private data — this endpoint
is called by an unauthenticated visitor deciding whether to sign up.

### 3.12 Accept an invite

`POST /api/v1/invites/:token/accept`

Auth: **required**. If the caller's account email doesn't match the
invite email (case-insensitive), respond 403 `email_mismatch`.

On success: creates the `organization_members` row with the invite's
role, sets `accepted_at`, returns the org payload from 3.3.

### 3.13 Onboarding progress

`GET /api/v1/organizations/:id/onboarding` → the progress row
`PATCH /api/v1/organizations/:id/onboarding` → mark steps done

Body:
```json
{ "step_named": true, "step_invited": true }
```

When all four booleans are true, set `completed_at = now()`.

### 3.14 Billing / seats (Owner only)

`GET /api/v1/organizations/:id/billing` → subscription state
`POST /api/v1/organizations/:id/billing/change-seats` → open a Dodo checkout to change seat count. Returns `{ checkout_url }`.

Dodo webhook must update `organizations.seat_count` on
`subscription.updated` events.

## 4. Cross-cutting

- **Role checks** on every draft/OCR endpoint: if the request's target
  resource has an `organization_id`, verify the caller is a member with
  at least Reader role, and — for mutations — at least Editor.
- **Seat enforcement** at invite time (3.8) and at Dodo webhook time.
- **Audit logging**: every mutation in this contract writes to the
  existing admin audit stream with a `kind:org_audit` prefix — actor,
  org_id, action, target, before/after where relevant.
- **Rate limits**: 3.8 (invite creation) capped at 200 emails per org
  per day to prevent invite-email abuse.
- **Idempotency**: 3.8 accepts an `Idempotency-Key` header; a repeat of
  the same key within 24h returns the original response, not a duplicate.

## 5. Environment variables

New on the backend:
- `DODO_TEAM_PLAN_CODE` — the Dodo product code for team seat billing
- `INVITE_TOKEN_TTL_DAYS` — default 7
- `ORG_INVITE_DAILY_CAP` — default 200

New on Express (frontend):
- `ENTERPRISE_MOCK_MODE` — `true` while the backend is not yet
  implemented; makes `lib/enterprise/api.js` return canned data so the
  UI is demoable. Turn to `false` (or unset) once the backend ships.

## 6. Migration order (backend)

1. Ship schema (all 4 tables + ALTER TABLE for `organization_id`).
2. Ship endpoints 3.1 → 3.13 (invite lifecycle first — that's the demo path).
3. Ship endpoint 3.14 last — needs Dodo team plan configured and webhook.
4. Turn `ENTERPRISE_MOCK_MODE=false` on Vercel.

## 7. Out of scope (Tier 2/3, later)

- SSO (Google Workspace SAML, Microsoft Entra)
- SCIM 2.0 provisioning
- Per-org SAML metadata + auto-join by verified email domain
- Custom subdomain / white-label
- Uptime SLA credits
- Signed DPA / MSA workflow
- SOC 2 Type II report
- Reviewer role (separate from Editor)
- Billing-only role
