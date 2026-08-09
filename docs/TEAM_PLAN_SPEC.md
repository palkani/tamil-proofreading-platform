# Team Plan — Technical Spec

Status: **Draft v1** · Author: architecture spec · Last updated: 2026-07-07

A B2B tier that lets one buyer purchase Pro access for multiple users under one organization, with consolidated billing and admin controls.

---

## 1. Overview

**Problem.** ProofTamil today sells only to individuals ($12/mo). Realistic buyers in the Tamil market — newsrooms, publishing houses, universities, agencies, government departments — will not swipe one card per user. They need a single purchase that covers a team, consolidated invoicing, and the ability for one admin to manage member access.

**Solution.** Introduce a Team plan: one purchase → one organization → many members → all get Pro. Pricing is per-seat with volume breaks. Ships as a distinct product on Dodo Payments alongside the existing PRO_MONTHLY / PRO_YEARLY products.

**Positioning.** This is *Team*, not *Enterprise*. Enterprise (SSO, custom contracts, dedicated support) is a Phase 3 concept that we sell manually to 100+ seat customers when they show up. Team is the productized SMB tier.

---

## 2. Goals and non-goals

### Goals

- G1. One buyer creates an organization and pays for N seats
- G2. Admin invites members by email; members inherit Pro
- G3. Admin can add/remove members, adjust seat count mid-cycle
- G4. Billing consolidated to one invoice, one credit card
- G5. Access revocation is immediate on member removal
- G6. Existing individual Pro users can join a team without dual-charge chaos
- G7. Dodo remains Merchant of Record — no change to tax handling

### Non-goals (Phase 1)

- N1. SSO / SAML / OIDC integration
- N2. Team-shared draft library
- N3. Per-team style guide
- N4. Team-level analytics dashboard
- N5. Custom roles beyond owner / admin / member
- N6. Per-team custom domain / white label
- N7. API keys per team
- N8. On-prem or self-hosted deployment

Any of these can move into Phase 2 or Phase 3 when a real prospect asks for them.

---

## 3. Personas

| Persona | Role | Job | Pain today |
|---|---|---|---|
| Newsroom editor | Team admin | Buys ProofTamil for their 8 Tamil writers, manages who has access | Can't buy 8 individual subscriptions; can't get one invoice; can't manage a team |
| Tamil writer at Dinamalar | Team member | Uses ProofTamil to check her copy before filing | Her editor bought ProofTamil for the team; she just needs Pro to work |
| ProofTamil ops (you) | Platform admin | Wants team customers because they represent higher ACV and lower churn | Today can only sell individual seats |
| Enterprise buyer | Sales conversation | 50+ seats, needs SSO, wants contract + PO invoicing | Deferred to Phase 3 (manual sales) |

---

## 4. Pricing strategy

### Recommended plan structure

| Plan | Price | Seat rules | Best for |
|---|---|---|---|
| **Individual Pro** | $12 / user / mo | 1 seat only | Solo writers, students |
| **Team Pro (Monthly)** | $9 / user / mo | 3-seat minimum; volume breaks | Newsrooms, agencies, small orgs |
| **Team Pro (Annual)** | $7.20 / user / mo (20% off) | 3-seat minimum | Committed teams |
| **Enterprise** | Contact sales | 100+ seats | Publishing houses, govt |

### Volume breaks (Team Monthly)

| Seats | Price / seat / mo |
|---|---|
| 3–14 | $9 |
| 15–49 | $7 |
| 50–99 | $5 |
| 100+ | Contact sales (custom) |

Volume break triggers automatically at seat-count updates. If a team goes 14 → 15 seats, next invoice's per-seat rate drops.

### Rationale

- **Per-seat, not flat tiers.** Flat tiers ("$80/mo for 10 seats") feel arbitrary. Every SaaS the buyer knows uses per-seat. Match the mental model.
- **25% discount vs individual.** Standard SaaS discount (Notion, Linear, Grammarly). Enough incentive to buy team when a team exists; small enough to protect margin on the individual tier.
- **3-seat minimum.** Filters out 2-person "teams" that don't need team features. Makes team ACV meaningfully bigger than individual ACV. Matches how organizational buying committees actually work.
- **Volume breaks at 15 and 50.** Real market segments: 3–14 = agency / startup / small newsroom; 15–49 = mid-size publisher / department; 50+ = enterprise deal worth a sales conversation.
- **Annual discount 20%.** Reduces churn, improves cash flow, filters serious buyers.
- **No trial for MVP.** Buyers who came to /pricing/team already have intent. Trial is Phase 2 optimization; keeping MVP simple means one less flow to build and one less state machine to reason about.

### Revenue math (for you)

- 5 team customers × 8 average seats × $9 = **$360/mo team revenue**
- To match with individual: 30 individual conversions × $12 = $360/mo
- Team is ~6× more sales-efficient once you have a channel (LinkedIn, direct outreach, referrals)
- Annual bookings dampen monthly churn significantly

---

## 5. User journeys

### 5.1 Buyer purchases team plan

```
1. Buyer lands on /pricing/team
2. Uses seat slider (3–50, defaults to 5) → sees "$45/mo" price update live
3. Clicks "Start team plan"
4. Enters: company name, admin email, billing email
5. Redirected to Dodo checkout with seat quantity in metadata
6. Pays with card
7. Redirected to /team/onboarding
8. Sees: "Your team is live. Invite your writers →"
9. Enters 5 email addresses (comma or newline separated)
10. Sends invitations
11. Sees list of pending invitations + "Add more" button
```

### 5.2 Member joins team

**Case A: member does not have a ProofTamil account.**

```
1. Receives email: "You've been invited to join <Team Name> on ProofTamil"
2. Clicks invitation link → lands on /join/:token
3. Sees: "You're joining <Team Name>. Create your account to accept."
4. Signs up (email + password OR Google)
5. On signup completion, invitation is auto-accepted
6. Redirected to /workspace with Pro active
7. Team admin gets email: "<Member> joined <Team Name>"
```

**Case B: member already has a ProofTamil account.**

```
1. Receives email
2. Clicks invitation link → lands on /join/:token
3. If logged in: sees "Join <Team Name>?" with Accept/Decline
4. If not logged in: prompted to sign in first
5. On accept: joined; Pro active immediately
6. If they had personal Pro: personal Pro paused (see edge case 11.3)
```

### 5.3 Admin adds a 6th member to a 5-seat plan

```
1. Admin visits /team/manage → sees "5 seats, 5 members"
2. Clicks "Invite member"
3. Enters email → submits
4. Sees modal: "You're at capacity. Add 1 more seat to invite this member?
   Your next invoice will include a prorated charge of $2.10."
5. Admin clicks "Add seat and invite"
6. Dodo API called to update quantity from 5 → 6
7. Invitation sent
```

### 5.4 Admin removes a member

```
1. Admin visits /team/manage → sees member list
2. Clicks "Remove" on a member row
3. Confirmation: "Remove <name>? Their access ends immediately.
   Your seat count stays at 6 until end of billing cycle
   (renews at 6 unless you reduce it before <renewal date>)."
4. Confirms
5. Member is removed; access revoked immediately
6. Seat count stays the same; frees up for a new invite
```

### 5.5 Admin cancels team

```
1. Admin visits /team/billing → clicks "Cancel plan"
2. Confirmation: "Cancel <Team Name>? All members lose Pro access at end of billing cycle: <date>.
   No refund. You can restart anytime."
3. Confirms → Dodo subscription cancelled at period end
4. On period-end webhook: mark org as cancelled; all members drop to free
```

---

## 6. Data model

### 6.1 New tables

**`organizations`**
```sql
CREATE TABLE organizations (
  id                    BIGSERIAL PRIMARY KEY,
  name                  VARCHAR(200) NOT NULL,
  slug                  VARCHAR(50) UNIQUE NOT NULL,     -- URL-safe: /team/dinamalar
  owner_user_id         BIGINT NOT NULL REFERENCES users(id),
  billing_email         VARCHAR(255) NOT NULL,
  billing_country_code  CHAR(2),
  vat_id                VARCHAR(50),                     -- GSTIN for India, VAT for EU/UK
  seat_count            INTEGER NOT NULL DEFAULT 3,      -- paid seats
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
                                                        -- active | past_due | cancelled | trial
  current_period_end    TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_seat_count_min CHECK (seat_count >= 3)
);
CREATE INDEX idx_organizations_owner_user_id ON organizations(owner_user_id);
CREATE INDEX idx_organizations_status ON organizations(status);
```

**`organization_members`**
```sql
CREATE TABLE organization_members (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  VARCHAR(20) NOT NULL DEFAULT 'member',  -- owner | admin | member
  invited_by_user_id    BIGINT REFERENCES users(id),
  joined_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
```

**`organization_invitations`**
```sql
CREATE TABLE organization_invitations (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email                 VARCHAR(255) NOT NULL,
  role                  VARCHAR(20) NOT NULL DEFAULT 'member',
  token                 VARCHAR(64) UNIQUE NOT NULL,
  invited_by_user_id    BIGINT NOT NULL REFERENCES users(id),
  expires_at            TIMESTAMPTZ NOT NULL,
  accepted_at           TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_org_invitations_email ON organization_invitations(LOWER(email));
CREATE INDEX idx_org_invitations_token ON organization_invitations(token);
CREATE INDEX idx_org_invitations_active ON organization_invitations(organization_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
```

### 6.2 Extensions to existing tables

**`subscriptions` (existing)**
```sql
ALTER TABLE subscriptions ADD COLUMN organization_id BIGINT REFERENCES organizations(id);
ALTER TABLE subscriptions ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;

-- Sanity: subscription belongs to a user OR an organization, not both.
ALTER TABLE subscriptions ADD CONSTRAINT chk_sub_owner
  CHECK ((user_id IS NULL) <> (organization_id IS NULL));

CREATE INDEX idx_subscriptions_organization_id
  ON subscriptions(organization_id)
  WHERE organization_id IS NOT NULL;
```

**`users` (existing)**
```sql
ALTER TABLE users ADD COLUMN active_organization_id BIGINT REFERENCES organizations(id);
-- Nullable: user can be in zero orgs, one org, or many.
-- When in many, active_organization_id tracks their current UI context.
```

### 6.3 Model rationale

- **Separate organizations table** rather than "team as a special user." Teams have different lifecycle, different billing shape, different access model.
- **Extend subscriptions with `organization_id`** rather than a separate `organization_subscriptions` table. Reuses all the existing invoice / renewal / webhook infrastructure. One less code path.
- **Quantity on subscription** = seat count. Maps 1:1 to Dodo's subscription quantity field. Proration works natively.
- **Invitation table** separate from members. A pending invite is not a member. Cleaner state machine.
- **`active_organization_id` on user** so multi-org users have a "current" context, exactly like Slack's active workspace.

---

## 7. Access control — how Pro inheritance works

### 7.1 The single truth function

```go
func (s *BillingService) UserIsPro(userID uint) (bool, error) {
    // Check 1: personal subscription active
    var user models.User
    if err := s.db.First(&user, userID).Error; err != nil { return false, err }
    if user.PremiumOverride { return true, nil }
    if user.Subscription == models.PlanPro &&
       user.SubscriptionEnd != nil && user.SubscriptionEnd.After(time.Now()) {
        return true, nil
    }

    // Check 2: active membership in a paying team
    var count int64
    s.db.Model(&models.OrganizationMember{}).
        Joins("JOIN organizations o ON o.id = organization_members.organization_id").
        Joins("JOIN subscriptions s ON s.organization_id = o.id").
        Where("organization_members.user_id = ?", userID).
        Where("o.status IN ('active', 'trial')").
        Where("s.status IN ('active', 'trialing')").
        Where("(s.current_period_end IS NULL OR s.current_period_end > NOW())").
        Count(&count)
    return count > 0, nil
}
```

Cached 60s per user_id in Redis. Cache invalidated on: subscription change, org membership change, org status change.

### 7.2 When Pro state is checked

- On every LLM request (proofread, rewrite, transliteration)
- On page loads that show Pro-only features
- On workspace draft-save (for large-doc limit)

**Do not bake Pro state into JWT.** JWTs live 15+ minutes. A member added to a team must get Pro access instantly. Recompute per-request; cache 60s.

### 7.3 Role permissions

| Action | Owner | Admin | Member |
|---|---|---|---|
| Use ProofTamil (get Pro) | ✓ | ✓ | ✓ |
| Invite new members | ✓ | ✓ | ✗ |
| Remove members | ✓ | ✓ | ✗ |
| Change roles | ✓ | ✗ | ✗ |
| Change seat count | ✓ | ✓ | ✗ |
| Update payment method | ✓ | ✗ | ✗ |
| Cancel subscription | ✓ | ✗ | ✗ |
| Transfer ownership | ✓ | ✗ | ✗ |
| Delete organization | ✓ | ✗ | ✗ |
| See billing history | ✓ | ✓ | ✗ |

Deliberately 3 roles. More granularity is Phase 3 enterprise territory.

---

## 8. API surface (Phase 1)

All routes namespaced under `/api/v1/team`.

### Public / auth-optional

```
GET  /pricing/team              Static page — pricing + seat slider (frontend only)
POST /join/:token/preview       Preview an invitation without accepting (name, org name)
```

### Authenticated

```
POST   /team/checkout                     Create org shell + start Dodo checkout for team plan
                                          Body: { name, billing_email, seat_count, is_annual }
                                          Returns: { checkout_url }

GET    /team/me                           List my org memberships + active org
                                          Returns: { organizations: [{id, name, role, ...}], active_organization_id }

POST   /team/:id/switch-active            Set the currently active org for UI context
                                          Body: { }
                                          Requires: member of org
```

### Admin / owner only

```
GET    /team/:id                          Org detail + settings
POST   /team/:id                          Update org (name, billing email, billing address)
POST   /team/:id/invitations              Create invitations (batch)
                                          Body: { emails: string[], role?: 'member'|'admin' }
                                          Returns: { created: [{id, email, expires_at}], failed: [{email, reason}] }
GET    /team/:id/invitations              List pending invitations
DELETE /team/:id/invitations/:invId       Revoke a pending invitation
POST   /team/:id/invitations/:invId/resend    Re-send an invitation email

GET    /team/:id/members                  List members (paginated)
DELETE /team/:id/members/:userId          Remove a member (frees seat pool)
PATCH  /team/:id/members/:userId          Change role
                                          Body: { role: 'admin'|'member' }
POST   /team/:id/members/:userId/transfer-owner    Owner-only. Transfer ownership.

POST   /team/:id/seats                    Update seat count via Dodo proration
                                          Body: { seat_count: number }
                                          Returns: { prorated_amount, next_invoice_amount }

GET    /team/:id/billing                  Plan detail + invoice history
POST   /team/:id/cancel                   Cancel at period end
POST   /team/:id/reactivate               Resume before period end
```

### Public join flow (uses token, not auth)

```
GET  /join/:token                         Landing page (public) — pre-accept preview
POST /join/:token                         Accept the invitation (must be authed)
                                          If unauthed: prompt sign-up first with ?join_token= param
```

### Admin console (for you, in `/admin`)

```
GET  /admin/organizations                 List all organizations, seat counts, revenue
GET  /admin/organizations/:id             Detail + members + invoices + audit log
POST /admin/organizations/:id/act-as      Impersonate a team admin (audit-logged)
```

---

## 9. UI wireframes (Phase 1)

### /pricing/team

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                    Team plan for Tamil writers               │
│      Everything Pro gives, but for your whole newsroom       │
│                                                              │
│    ┌────────────────────────────────────────────────────┐    │
│    │                                                    │    │
│    │  How many writers on your team?                    │    │
│    │                                                    │    │
│    │  [○━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━]  8 seats     │    │
│    │   3                                       50       │    │
│    │                                                    │    │
│    │                                                    │    │
│    │  $9  per user per month                            │    │
│    │  ──                                                │    │
│    │  $72 / month total                                 │    │
│    │                                                    │    │
│    │  Save 20% with annual billing — $57.60/month       │    │
│    │  ☐ Bill annually                                   │    │
│    │                                                    │    │
│    │       [ Start team plan → ]                        │    │
│    │                                                    │    │
│    └────────────────────────────────────────────────────┘    │
│                                                              │
│    ✓ All Pro features   ✓ Consolidated invoice               │
│    ✓ Manage members     ✓ Cancel anytime                     │
│                                                              │
│    Need more than 100 seats or SSO? Contact sales            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### /team/manage

```
┌──────────────────────────────────────────────────────────────┐
│  Dinamalar Digital ● Owner                     [ Invite ]    │
│  ────────────────────────────────────                         │
│  8 of 8 seats used   |   Monthly plan   |   Renews Aug 6     │
│                                                              │
│  Members                                                     │
│  ─────────────────────────────────────────────────────────   │
│  ● Priya Ramanathan     Owner    Joined Jun 12   —           │
│  ● Karthik Nadarajan    Admin    Joined Jun 14   [ ⋯ ]      │
│  ● Malar Iyer           Member   Joined Jun 14   [ ⋯ ]      │
│  ○ Rakesh Subramanian   Member   Invited 2d ago  [ Resend ] │
│                                        ...                   │
│                                                              │
│  Pending invitations (2)                                     │
│  ─────────────────────────────────────────────────────────   │
│  rasa@dinamalar.com     Invited 5d ago      [ Resend ][ ✕ ] │
│  meenu@dinamalar.com    Invited 1d ago      [ Resend ][ ✕ ] │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### /team/billing

```
┌──────────────────────────────────────────────────────────────┐
│  Team billing                                                │
│  ────────────────                                             │
│                                                              │
│  Current plan                                                │
│  ────────────                                                │
│  8 seats × $9/mo = $72/mo                                    │
│  Next invoice: Aug 6, 2026  ·  $72.00                        │
│                                                              │
│  [ Change seats ]   [ Switch to annual (save 20%) ]          │
│                                                              │
│  Billing contact                                             │
│  ────────────                                                │
│  billing@dinamalar.com                        [ Edit ]       │
│                                                              │
│  Payment method                                              │
│  ────────────                                                │
│  Visa •••• 4242                               [ Update ]     │
│                                                              │
│  Invoice history                                             │
│  ─────────────────────────────────────────────                │
│  Jul 6, 2026    $72.00    Paid     [ Download PDF ]          │
│  Jun 6, 2026    $72.00    Paid     [ Download PDF ]          │
│  ...                                                          │
│                                                              │
│  ────                                                         │
│  [ Cancel plan ]  (danger)                                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Dodo Payments integration

### 10.1 Product setup on Dodo

New products on Dodo:

- **TEAM_MONTHLY** — recurring monthly, USD, tax_exclusive
- **TEAM_YEARLY** — recurring yearly, USD, tax_exclusive (2 months free)

Products use Dodo's native `quantity` field. Every seat = 1 quantity unit.

### 10.2 Create subscription

```go
reqBody := dodoSubscriptionCreateRequest{
    Billing:    dodoBillingAddressParam{Country: billingCountry},
    Customer:   dodoCustomerPayload{Email: billingEmail, Name: companyName},
    ProductID:  productIDTeamMonthly, // or team_yearly
    Quantity:   seatCount,
    PaymentLink: true,
    Metadata: map[string]string{
        "organization_id": strconv.FormatUint(uint64(org.ID), 10),
        "plan_code":       "TEAM_MONTHLY",
        "seat_count":      strconv.Itoa(seatCount),
    },
    ReturnURL: successURL,
}
```

### 10.3 Adjust seats mid-cycle

```
PATCH https://api.dodopayments.com/subscriptions/{sub_id}
{ "quantity": <new_seat_count> }
```

Dodo calculates proration automatically and charges/credits the difference on the next invoice.

### 10.4 Webhook handling

Extend the existing Dodo webhook handler (`webhook_handlers.go`). Two changes:

1. `handleDodoSubscriptionActive` — check metadata: if `organization_id` present → team subscription path (activate org, don't touch a user record).
2. New handler: `handleDodoSubscriptionUpdated` — fires when quantity changes. Sync `organizations.seat_count` with Dodo's quantity.

```go
if orgIDStr, ok := metadata["organization_id"]; ok {
    // Team subscription path
    orgID, _ := strconv.ParseUint(orgIDStr, 10, 64)
    return s.handleDodoTeamSubscriptionActive(event, uint(orgID))
}
// else — existing individual path
```

### 10.5 Cancellation

Team owner clicks Cancel → we call Dodo's cancel endpoint with `at_period_end: true`. Members retain access until period end. On `subscription.cancelled` webhook, mark `organizations.status = 'cancelled'`. On `subscription.expired`, revoke all member Pro inheritance.

---

## 11. Edge cases and decisions

### 11.1 User already has personal Pro and joins a team

**Decision:** pause their personal subscription (`status = 'suspended'`) automatically. They keep Pro via team. If they leave the team, personal Pro auto-resumes if not expired.

**Alternative rejected:** allow dual subscriptions. Confusing for user, awkward invoicing, no upside.

### 11.2 User is in multiple teams

**Decision:** allowed. Any active team grants Pro. UI shows an org switcher (like Slack) — `active_organization_id` on user record tracks context.

### 11.3 Team owner leaves the company (unresponsive)

**Decision:**
1. Any admin can call `transfer-ownership` if the current owner has been inactive 60+ days (login-based check).
2. If no admin exists, ops manually transfers via `/admin/organizations/:id/act-as` (audit-logged).
3. Ownership transfer is one-way — old owner becomes admin, new owner has full rights.

### 11.4 Payment fails on team subscription

**Decision:** grace period 7 days.
- Days 1–7 past due: banner shown to admin, no access change
- Day 8+: all members downgraded to read-only in UI (can see existing drafts, can't submit new proofread requests)
- Day 30: subscription cancelled by Dodo, org marked cancelled, all members lose Pro

### 11.5 Admin removes a member mid-cycle

**Decision:**
- Member access revoked immediately
- Seat count is NOT reduced automatically — the seat frees up for a new invite
- Admin can explicitly reduce seat count via `/team/:id/seats` if they don't want to re-invite

**Alternative rejected:** auto-reduce seats. Encourages "hire, fire, save money" churn behavior. Also confuses the "seats vs members" mental model.

### 11.6 Invitation to email that doesn't have an account

**Decision:** email is sent with a signup link `?join_token=<token>`. On signup completion, auto-accept the invitation. Handles both signup + join in one flow.

### 11.7 Invitation expires

**Decision:** invitations expire 30 days after creation. Admin can resend at any time (issues a new token, invalidates old one). Expired invitations show as `expired` in the admin UI with a Resend action.

### 11.8 User is deleted (GDPR right-to-delete) while a team member

**Decision:** cascade delete their `organization_members` row. Frees the seat pool but does not reduce seat count. Team admin sees the member disappear; no notification triggered.

### 11.9 Seat count would go below active member count

**Decision:** reject the seat reduction with a specific error:
```json
{
  "error": "seat_below_members",
  "message": "You have 6 active members. Remove members first, then reduce seats to below 6."
}
```

### 11.10 Enterprise sales lead (100+ seats via slider)

**Decision:** slider caps at 100. Above 100, "Start team plan" button changes to "Contact sales" → email form to `sales@prooftamil.com`. Manual sales conversation for enterprise deals.

### 11.11 Tax / VAT for team plans

**Decision:** use `organizations.billing_country_code` as the tax jurisdiction. Dodo handles VAT/GST as Merchant of Record based on billing address. If admin provides `vat_id` (GSTIN or EU VAT number), Dodo applies reverse-charge or zero-rating as applicable.

### 11.12 Refund policy

**Decision:** no refunds on team subscriptions once activated. Cancellations take effect at period end. Same policy as individual Pro. Document clearly on `/pricing/team`.

---

## 12. Implementation phases

### Phase 1: MVP (3 weeks)

**Goal:** ship a functional team plan. One buyer can purchase, invite, manage.

- **Week 1 — Data + billing**
  - Migrations for `organizations`, `organization_members`, `organization_invitations`
  - Extend `subscriptions` + `users`
  - New Dodo products created (TEAM_MONTHLY, TEAM_YEARLY)
  - `UserIsPro()` computes personal + team inheritance
  - Backend endpoints: `POST /team/checkout`, webhook branching, `GET /team/me`

- **Week 2 — Team management**
  - Invite / accept flow (both signup and existing-user paths)
  - `/team/manage` frontend page
  - Member list, invite, remove, role change
  - Seat count update with Dodo proration

- **Week 3 — Billing UX + polish**
  - `/team/billing` invoice history + payment method update
  - `/pricing/team` sales page with slider
  - Cancellation flow + reactivation
  - Email notifications: welcome, member joined/left, renewal, past due
  - Admin console `/admin/organizations` for you to monitor

### Phase 2: Enterprise readiness (Q4 2026, 3–4 weeks)

- SSO via OIDC (Google Workspace first, Microsoft second)
- Domain lock (`@company.com` auto-joins on signup)
- Team-shared draft library (drafts scoped to organization)
- Usage analytics per member for team admins
- Audit log per team (who did what)
- Custom invoicing (PO / NET-30) for larger deals
- CSV export of team members + usage

### Phase 3: Enterprise custom (as-needed, sales-driven)

- On-premise deployment
- SLA contracts + dedicated support channel
- Custom AI model fine-tuning
- Team-specific style guides
- White-label / custom domain
- API keys per team

---

## 13. Success metrics

Ship Phase 1 and measure after 60 days:

- **Team signups per week** — target: 1 in first 30 days, 3/week by day 60
- **Average seat count at signup** — target: 5+
- **Team ACV** — target: $300+/mo per team on average
- **Team churn** — target: <5%/mo (individual churn today is unknown but likely higher)
- **Individual → team upgrade** — target: 10% of individual Pro users get invited to a team within 90 days
- **Support burden** — target: <30 min/week of team admin support

If we're below on team signups after 60 days: distribution problem, not product problem. Push LinkedIn outreach, case studies, direct sales.

If churn is high: onboarding problem. Add onboarding email drip, in-app tour for team admins.

---

## 14. Open questions (for review)

- **Q1.** Do we support "trial" for team plans (14-day free) in Phase 1, or defer to Phase 2? Argument for defer: adds state complexity, unclear if it converts.
- **Q2.** Should individual Pro users automatically get invited to a "personal team" of 1 so all users are always in an org? Argument for: simpler mental model in code. Argument against: over-abstraction; individual users don't want to think about "teams."
- **Q3.** Should `contact@prooftamil.com` (you) be visible as a hidden owner of all orgs for support access? Argument for: support workflows. Argument against: privacy — use the audit-logged impersonation flow instead.
- **Q4.** For UK/EU teams, do we require the admin to enter a company address at checkout (for VAT purposes)? Dodo currently doesn't ask for full address. Adds friction but improves invoice quality.
- **Q5.** Ownership transfer to a member who isn't yet on the team — should we allow "invite as owner"? Simpler if we only allow ownership transfer to existing admins.
- **Q6.** Do we differentiate storage limits per plan (individual Pro vs team member) or unify them? Currently individual has an implicit workspace limit; teams might reasonably use more.

Each of these can be resolved before code starts. My defaults (in the spec above) are the pragmatic choices; open questions are where we'd want to think again with a specific customer in mind.

---

## 15. What is NOT in this spec

- Frontend implementation details (React vs EJS templates, styling, motion)
- Copy for every UI string (write during build, revisit for tone)
- Email templates (design during build; use existing Resend infra)
- Detailed retry/error paths for every API endpoint
- Load testing plan (not needed until 10× current traffic)
- I18n of the team UI (English-only in Phase 1; Tamil UI is a separate Phase 3 concern)

---

**End of spec.** Review, comment inline, and mark decisions as we go. When we agree, I convert this into a concrete implementation ticket sequence and start Phase 1 code.
