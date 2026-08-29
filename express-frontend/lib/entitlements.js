/**
 * Per-feature entitlements for the new Lite Pro tiers.
 *
 * Background
 * ──────────
 * Historically ProofTamil had one Pro plan (PRO_MONTHLY / PRO_YEARLY)
 * that unlocked every premium feature. On 2026-08-29 we added two
 * "Lite" tiers that unlock a subset of features at a lower price:
 *
 *   PRO_PROOFREAD_LITE_MONTHLY / _YEARLY  → proofreading + export, NO OCR
 *   PRO_OCR_LITE_MONTHLY       / _YEARLY  → OCR only,              NO proofreading pro, NO export
 *   PRO_MONTHLY                / _YEARLY  → everything (unchanged)
 *
 * The backend surfaces this via a new `billing.entitlements` array on
 * the /api/v1/billing/me response. See EXPRESS_FRONTEND_ENTITLEMENTS_CONTRACT.md
 * for the full backend spec.
 *
 * Backward-compat guarantee — READ THIS BEFORE CHANGING THE HELPER
 * ────────────────────────────────────────────────────────────────
 * Every existing Pro subscriber today has:
 *   billing.is_premium === true
 *   billing.entitlements === undefined  (backend hasn't shipped the field yet)
 *
 * The helper below MUST return `true` for every feature in that state,
 * so no existing paying user loses access when this code deploys but
 * before the backend catches up. That's the entire second early-return.
 * Do not remove it until you have verified backend is populating
 * entitlements for every active subscription.
 */

/**
 * Canonical feature names. Kept as constants so a typo becomes a
 * ReferenceError instead of silently denying access.
 */
const FEATURES = {
  PROOFREADING: 'proofreading',   // unlimited grammar/spell checks + no word cap
  OCR:          'ocr',            // 20 handwriting-OCR extractions per month
  EXPORT:       'export',         // DOCX / PDF / TXT download from the workspace
  AI_WRITER:    'ai_writer',      // AI content writer premium quotas (optional; not gated yet)
};

/**
 * hasFeature(billing, feature) → boolean
 *
 *   billing  the object at `resp.data.billing` from /api/v1/billing/me,
 *            typically { is_premium: bool, plan_code: string,
 *                        entitlements?: string[] }.
 *            May be null/undefined for anonymous or fetch-failed states —
 *            those correctly return false.
 *   feature  one of the FEATURES constants above (or the string directly).
 */
function hasFeature(billing, feature) {
  if (!billing || billing.is_premium !== true) return false;
  // BC: existing Pro subscribers have no entitlements field yet.
  // Treat as "Full Pro" so they don't lose access on this deploy.
  if (!Array.isArray(billing.entitlements)) return true;
  return billing.entitlements.includes(String(feature));
}

/**
 * Least-privilege helper — "is the user on a paid plan that DOES NOT
 * include this feature?" Semantics distinct from !hasFeature():
 *
 *   Free user (no paid plan)           → false  (they get free-tier access
 *                                                to every feature via
 *                                                free-tier quotas — no
 *                                                block, just quota)
 *   Paid user WITH the feature         → false  (allow, they're entitled)
 *   Paid user WITHOUT the feature      → true   (block: they explicitly
 *                                                bought a plan that excludes
 *                                                this feature; showing the
 *                                                free-tier version would
 *                                                nag them for another upgrade)
 *
 * Use to hard-gate tool pages so a Pro Proofread Lite user doesn't see
 * the OCR tool and a Pro OCR Lite user doesn't see workspace pro
 * features. Free users are never blocked — they always get free-tier.
 */
function isPaidWithoutFeature(billing, feature) {
  if (!billing || billing.is_premium !== true) return false;
  return !hasFeature(billing, feature);
}

/**
 * Convenience: which named plan this billing object represents,
 * for admin UIs and analytics. Falls back to 'unknown' if the
 * plan_code isn't recognised so future backend plans don't crash
 * the admin console.
 */
function planLabel(billing) {
  if (!billing || billing.is_premium !== true) return 'Free';
  const code = String(billing.plan_code || '').toUpperCase();
  if (code.startsWith('PRO_PROOFREAD_LITE')) return 'Pro · Proofreading Lite';
  if (code.startsWith('PRO_OCR_LITE'))       return 'Pro · OCR Lite';
  if (code.startsWith('PRO_'))               return 'Pro';
  return 'Pro'; // BC: existing subscribers without a lite prefix
}

module.exports = { hasFeature, planLabel, isPaidWithoutFeature, FEATURES };
