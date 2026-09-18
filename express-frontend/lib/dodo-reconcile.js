/**
 * Pure reconciliation logic. Given a local Supabase override row and a
 * canonical Dodo subscription, compute the patch to apply (if any) and
 * an explanation.
 *
 * Why this is a separate module
 * ─────────────────────────────
 * Reconciliation runs from TWO callers (nightly cron + admin button) and
 * a family of edge cases needs to behave IDENTICALLY in both. Keeping the
 * decision logic pure (no I/O, no imports of axios/supabase) means we can
 * unit-test every case with fixtures instead of live Dodo/Supabase calls,
 * AND the two callers can't diverge over time.
 *
 * Never-demote invariants
 * ───────────────────────
 * - Never mark is_premium=false unless Dodo EXPLICITLY says the
 *   subscription is cancelled/expired AND our expires_at has already
 *   passed. A temporary API blip or a Dodo 404 must NOT revoke a paying
 *   customer's access.
 * - Never SHORTEN expires_at. If Dodo returns an earlier period end than
 *   what we have (theoretically shouldn't happen), we keep our value —
 *   erring on the side of the customer.
 * - Never OVERWRITE plan_code with a fallback. If Dodo's product_id
 *   isn't in our PRODUCT_ENTITLEMENTS map, we log and leave plan_code
 *   alone.
 */

const webhooks = require('./webhooks-dodo');

/**
 * Compute the reconciliation action given a local row + a Dodo subscription.
 *
 * @param {object} local  Row from admin_user_entitlement_overrides.
 *                        Fields we read: email, is_premium, expires_at,
 *                        plan_code, plan_label, entitlements, auto_renew,
 *                        payment_status, dodo_subscription_id.
 *                        Row may be null (never activated).
 * @param {object} dodo   Normalised Dodo subscription from dodo-api.
 *                        Fields we read: id, product_id, status,
 *                        current_period_end, cancel_at_period_end,
 *                        cancelled_at, currency, amount_cents,
 *                        customer_id, customer_email.
 *
 * @returns {object} { action, patch, changes, reason }
 *   action:  'noop' | 'extend' | 'soft_cancel' | 'hard_expire' | 'grant'
 *   patch:   object suitable for upsertOverride() (or null for noop)
 *   changes: array of human-readable strings describing what changed
 *   reason:  short string for logging
 */
function reconcile(local, dodo) {
  if (!dodo) {
    return { action: 'noop', patch: null, changes: [], reason: 'no_dodo_data' };
  }

  const dodoStatus = String(dodo.status || '').toLowerCase();
  const dodoActive =
    dodoStatus === 'active' ||
    dodoStatus === 'on_trial' ||
    dodoStatus === 'trialing';
  const dodoCancelled =
    dodoStatus === 'cancelled' || dodoStatus === 'canceled' ||
    dodoStatus === 'expired'   || dodoStatus === 'failed';
  const dodoOnHold =
    dodoStatus === 'on_hold' || dodoStatus === 'paused' || dodoStatus === 'past_due';

  // ── Case 1: nothing local, Dodo says active → GRANT ───────────────
  // This happens when the very first webhook was missed entirely.
  if (!local && dodoActive) {
    const ents = webhooks.resolveEntitlements(dodo.product_id);
    return {
      action: 'grant',
      reason: 'no_local_row_dodo_active',
      changes: [`grant new (plan=${ents.plan_code}, expires=${dodo.current_period_end || 'default_32d'})`],
      patch: {
        email:                dodo.customer_email,
        is_premium:           true,
        entitlements:         ents.entitlements,
        plan_code:            ents.plan_code,
        plan_label:           ents.plan_label,
        expires_at:           dodo.current_period_end || defaultExpires(),
        next_renewal_at:      dodo.current_period_end || defaultExpires(),
        payment_status:       'active',
        auto_renew:           dodo.cancel_at_period_end === false,
        dodo_customer_id:     dodo.customer_id || undefined,
        dodo_subscription_id: dodo.id || undefined,
        currency:             dodo.currency || undefined,
        amount_cents:         dodo.amount_cents || undefined,
        cancelled_at:         null,
        granted_by_email:     'dodo-reconcile',
        notes:                `reconciled ${new Date().toISOString().slice(0, 10)} · initial grant from Dodo · sub ${dodo.id}`,
      },
    };
  }

  if (!local) {
    return { action: 'noop', patch: null, changes: [], reason: 'no_local_no_dodo_active' };
  }

  // ── Case 2: Dodo active, our expires_at drifted → EXTEND ──────────
  // The bread-and-butter case. Missed a renewal webhook; Dodo is still
  // charging every month; extend our expires_at to Dodo's period end.
  if (dodoActive) {
    const dodoEnd = dodo.current_period_end;
    const localEnd = local.expires_at;
    // Only extend if Dodo's end is strictly LATER than ours (never
    // shorten). Also honour cancel_at_period_end: if Dodo says the
    // sub is set to cancel at period end, that means "active until X
    // then cancelled" — still extend to X but flag auto_renew=false.
    const shouldExtend = dodoEnd && (!localEnd || new Date(dodoEnd) > new Date(localEnd));
    const shouldFlipAutoRenew = dodo.cancel_at_period_end === true && local.auto_renew !== false;
    const shouldPromoteToPremium = !local.is_premium;
    const shouldSetActive = local.payment_status !== 'active' && !(dodo.cancel_at_period_end === true);

    if (!shouldExtend && !shouldFlipAutoRenew && !shouldPromoteToPremium && !shouldSetActive) {
      return { action: 'noop', patch: null, changes: [], reason: 'in_sync' };
    }

    const changes = [];
    if (shouldExtend) changes.push(`expires_at ${localEnd || 'none'} → ${dodoEnd}`);
    if (shouldPromoteToPremium) changes.push('is_premium false → true');
    if (shouldSetActive) changes.push(`payment_status ${local.payment_status || 'none'} → active`);
    if (shouldFlipAutoRenew) changes.push('auto_renew → false (Dodo cancel_at_period_end)');

    const patch = { email: local.email };
    if (shouldExtend) {
      patch.expires_at = dodoEnd;
      patch.next_renewal_at = dodoEnd;
    }
    if (shouldPromoteToPremium) patch.is_premium = true;
    if (shouldSetActive) patch.payment_status = 'active';
    if (shouldFlipAutoRenew) patch.auto_renew = false;
    // Always refresh Dodo IDs / currency / amount when we've made a
    // change — cheap way to keep the row's audit fields current
    // without extra logic.
    if (dodo.id && !local.dodo_subscription_id) patch.dodo_subscription_id = dodo.id;
    if (dodo.customer_id && !local.dodo_customer_id) patch.dodo_customer_id = dodo.customer_id;
    patch.notes = `reconciled ${new Date().toISOString().slice(0, 10)} · ${changes.join(' · ')}`;

    return { action: 'extend', patch, changes, reason: 'dodo_active_drift' };
  }

  // ── Case 3: Dodo cancelled/expired → SOFT CANCEL or HARD EXPIRE ───
  // Soft cancel: mark auto_renew=false but preserve expires_at (user paid
  // through the current period). Hard expire: only if expires_at already
  // passed AND Dodo says explicitly ended.
  if (dodoCancelled) {
    const now = new Date();
    const localExpired = local.expires_at && new Date(local.expires_at) < now;

    // Hard expire path — safe: user's paid period is over and Dodo
    // confirms subscription is dead.
    if (localExpired && local.is_premium) {
      return {
        action: 'hard_expire',
        reason: 'dodo_cancelled_local_expired_still_premium',
        changes: ['is_premium true → false (Dodo cancelled + already past expires_at)'],
        patch: {
          email:            local.email,
          is_premium:       false,
          payment_status:   'expired',
          auto_renew:       false,
          cancelled_at:     dodo.cancelled_at || now.toISOString(),
          notes:            `reconciled ${now.toISOString().slice(0, 10)} · hard-expired (Dodo status=${dodoStatus})`,
        },
      };
    }

    // Soft cancel path — user still has time on their paid period.
    // Only patch fields that aren't already correct.
    const shouldFlipAutoRenew = local.auto_renew !== false;
    const shouldStampCancelledAt = !local.cancelled_at;
    const shouldSetCancelled = local.payment_status !== 'cancelled' && local.payment_status !== 'expired';
    if (!shouldFlipAutoRenew && !shouldStampCancelledAt && !shouldSetCancelled) {
      return { action: 'noop', patch: null, changes: [], reason: 'already_soft_cancelled' };
    }
    const changes = [];
    if (shouldFlipAutoRenew) changes.push('auto_renew → false');
    if (shouldSetCancelled) changes.push(`payment_status ${local.payment_status || 'none'} → cancelled`);
    if (shouldStampCancelledAt) changes.push('cancelled_at stamped');
    return {
      action: 'soft_cancel',
      reason: 'dodo_cancelled_local_still_active_period',
      changes,
      patch: {
        email:          local.email,
        ...(shouldFlipAutoRenew ? { auto_renew: false } : {}),
        ...(shouldSetCancelled ? { payment_status: 'cancelled' } : {}),
        ...(shouldStampCancelledAt ? { cancelled_at: dodo.cancelled_at || new Date().toISOString() } : {}),
        notes: `reconciled ${new Date().toISOString().slice(0, 10)} · soft-cancel (Dodo status=${dodoStatus})`,
      },
    };
  }

  // ── Case 4: Dodo on_hold / past_due → mark payment_status only ────
  // Grace period; keep premium alive during Dodo's retry window (same
  // pattern as the webhook payment_failed bucket).
  if (dodoOnHold) {
    if (local.payment_status === 'past_due') {
      return { action: 'noop', patch: null, changes: [], reason: 'already_past_due' };
    }
    return {
      action: 'noop_past_due',
      reason: 'dodo_on_hold',
      changes: [`payment_status → past_due (Dodo status=${dodoStatus})`],
      patch: {
        email:          local.email,
        payment_status: 'past_due',
        notes:          `reconciled ${new Date().toISOString().slice(0, 10)} · past_due (Dodo status=${dodoStatus})`,
      },
    };
  }

  // ── Case 5: unknown status → noop ─────────────────────────────────
  return { action: 'noop', patch: null, changes: [], reason: 'unknown_dodo_status_' + dodoStatus };
}

function defaultExpires() {
  return new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();
}

module.exports = { reconcile };
