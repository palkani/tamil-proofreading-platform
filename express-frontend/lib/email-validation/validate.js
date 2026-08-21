/**
 * Strict email validation used at registration + wherever we accept an
 * email as a durable identity. Three checks in order of increasing cost:
 *
 *   1. SYNTAX          — RFC 5322-lite regex + length caps. Cheap, sync.
 *   2. DISPOSABLE      — blocklist lookup (lib/email-validation/blocklist).
 *                        Sync. Also catches subdomains ("foo.mailinator.com").
 *   3. MX RECORD       — dns.resolveMx() on the domain. Async, network,
 *                        cached in-process for 1 hour (LRU 500).
 *
 * A common-typo suggester runs alongside — "gmial.com" → "gmail.com"
 * etc. The suggestion is returned even for valid addresses so the UI
 * can offer "did you mean" prompts.
 *
 * Failure posture:
 *   - DNS lookup timeout / server error → treat as UNKNOWN and return
 *     valid=true with reason: 'mx_check_unavailable'. The API layer can
 *     still choose to allow it (safer default) rather than blocking
 *     every registration during a DNS outage.
 *
 * All calls take a plain string. Returns:
 *   {
 *     valid: boolean,
 *     reason?: 'syntax' | 'disposable' | 'no_mx' | 'mx_check_unavailable',
 *     message: 'Human-readable reason for the UI',
 *     suggestion?: 'gmail.com' | ..  // when a typo was detected
 *   }
 */

const dns = require('node:dns').promises;
const { isDisposableDomain } = require('./blocklist');

// ── Syntax ────────────────────────────────────────────────────────────
// RFC 5322 is intentionally permissive (allows quoted strings, comments,
// bracketed IPs). For registration we're stricter: a single @, dot in the
// domain, only reasonable characters in the local part. Rejects things
// most users would consider invalid.
const EMAIL_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]{0,62})?@([a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,24}$/;

function checkSyntax(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 6 || trimmed.length > 254) return false;
  if (trimmed.includes('..')) return false;              // consecutive dots
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) return false;
  return EMAIL_RE.test(trimmed);
}

// ── Common-typo domain suggestions ────────────────────────────────────
// Small hand-picked table of the highest-traffic providers + their
// common misspellings. Ordered so exact matches short-circuit.
const TYPO_SUGGESTIONS = new Map([
  // Gmail
  ['gmial.com', 'gmail.com'], ['gmai.com', 'gmail.com'], ['gmil.com', 'gmail.com'],
  ['gnail.com', 'gmail.com'], ['gmali.com', 'gmail.com'], ['gmaill.com', 'gmail.com'],
  ['gmaik.com', 'gmail.com'], ['gmail.co', 'gmail.com'], ['gmail.cm', 'gmail.com'],
  ['gmail.con', 'gmail.com'], ['gmailc.om', 'gmail.com'], ['gnmail.com', 'gmail.com'],
  ['gmail.com.au', 'gmail.com'], // usually intended as .com
  // Yahoo
  ['yaho.com', 'yahoo.com'], ['yahooo.com', 'yahoo.com'], ['yahoocom', 'yahoo.com'],
  ['yahoo.co', 'yahoo.com'], ['yaho.co.in', 'yahoo.co.in'],
  // Outlook / Hotmail / Live
  ['hotmial.com', 'hotmail.com'], ['hotnail.com', 'hotmail.com'],
  ['hotmai.com', 'hotmail.com'], ['hotmail.co', 'hotmail.com'],
  ['outlok.com', 'outlook.com'], ['outook.com', 'outlook.com'],
  // iCloud
  ['icoud.com', 'icloud.com'], ['icould.com', 'icloud.com'],
  // Rediff / Indian providers (relevant for Tamil audience)
  ['rediff.com.in', 'rediffmail.com'], ['rediffmail.co', 'rediffmail.com'],
  // Corporate
  ['orgnaization.com', null], // no suggestion, but signal user typed a placeholder
]);

function suggestTypoFix(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  const suggested = TYPO_SUGGESTIONS.get(domain);
  if (!suggested) return null;
  return email.slice(0, at + 1) + suggested;
}

// ── Disposable check with subdomain widening ──────────────────────────
// mailinator.com is on the blocklist; foo.mailinator.com should also fail.
// We walk from the full domain up to the eTLD+1 (best-effort — we don't
// bundle the Public Suffix List, so this is a simple label-strip that
// works for gtlds and most cctlds).
function checkDisposable(domain) {
  const parts = String(domain).toLowerCase().split('.').filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (isDisposableDomain(candidate)) return true;
  }
  return false;
}

// ── MX record cache ───────────────────────────────────────────────────
// Domain → { valid: boolean|null (null = unknown), until: ms epoch }.
// null valid means "DNS was unreachable, we don't know" — cached so we
// don't hammer the resolver during an outage.
const MX_CACHE = new Map();
const MX_CACHE_MAX = 500;
const MX_CACHE_TTL_MS = 60 * 60 * 1000;   // 1 hour
const MX_UNKNOWN_TTL_MS = 5 * 60 * 1000;  // 5 min for failure — retry sooner
const MX_TIMEOUT_MS = 3500;

async function checkMx(domain) {
  const now = Date.now();
  const cached = MX_CACHE.get(domain);
  if (cached && cached.until > now) return cached.valid;

  let valid;
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, rej) => setTimeout(() => rej(new Error('mx_timeout')), MX_TIMEOUT_MS)),
    ]);
    valid = Array.isArray(records) && records.length > 0 && records.some((r) => r && r.exchange);
  } catch (err) {
    if (err && (err.code === 'ENOTFOUND' || err.code === 'ENODATA')) {
      valid = false;                      // domain doesn't accept mail
    } else {
      valid = null;                       // DNS itself failed — unknown
    }
  }

  // Trim if oversized (crude LRU: drop the first-inserted entry).
  if (MX_CACHE.size >= MX_CACHE_MAX) {
    const first = MX_CACHE.keys().next().value;
    if (first) MX_CACHE.delete(first);
  }
  MX_CACHE.set(domain, {
    valid,
    until: now + (valid === null ? MX_UNKNOWN_TTL_MS : MX_CACHE_TTL_MS),
  });
  return valid;
}

/**
 * validateEmail(email, opts?) → { valid, reason?, message, suggestion? }
 *
 *   opts.skipMx: skip the DNS lookup (useful for client-side pre-checks
 *                where we want fast syntax + blocklist feedback).
 */
async function validateEmail(email, opts = {}) {
  const raw = String(email || '').trim().toLowerCase();

  if (!checkSyntax(raw)) {
    return {
      valid: false,
      reason: 'syntax',
      message: 'Enter a valid email address (e.g. you@example.com).',
      suggestion: suggestTypoFix(raw) || undefined,
    };
  }

  const domain = raw.slice(raw.lastIndexOf('@') + 1);

  if (checkDisposable(domain)) {
    return {
      valid: false,
      reason: 'disposable',
      message: 'This looks like a disposable / temporary email address. Please use a permanent address you check regularly — you\'ll need it to receive account, security, and billing emails.',
    };
  }

  const suggestion = suggestTypoFix(raw) || undefined;

  if (opts.skipMx) {
    return { valid: true, message: 'Looks good.', suggestion };
  }

  const mxValid = await checkMx(domain);
  if (mxValid === false) {
    return {
      valid: false,
      reason: 'no_mx',
      message: `The domain "${domain}" cannot receive email. Check for a typo.`,
      suggestion,
    };
  }
  if (mxValid === null) {
    // DNS unreachable — don't block registration on a DNS outage.
    return {
      valid: true,
      reason: 'mx_check_unavailable',
      message: 'Email accepted (domain verification skipped — DNS unreachable).',
      suggestion,
    };
  }

  return { valid: true, message: 'Looks good.', suggestion };
}

module.exports = { validateEmail, checkSyntax, checkDisposable, suggestTypoFix };
