/**
 * Latency-based regional Cloud Run backend resolver.
 *
 * How it works
 * ─────────────
 * Vercel injects geographic headers into every inbound request:
 *   x-vercel-ip-continent  "AS" | "OC" | "NA" | "EU" | "AF" | "SA" | "AN"
 *   x-vercel-ip-country    ISO-3166-1 alpha-2 country code, e.g. "IN", "SG", "US"
 *
 * We route based on continent:
 *   AS (Asia), OC (Oceania) → BACKEND_URL_ASIA   (your Asia Cloud Run instance)
 *   Everywhere else          → BACKEND_URL_US     (your US Cloud Run instance)
 *
 * Required env vars (set in Vercel dashboard):
 *   BACKEND_URL_ASIA   Full Cloud Run URL for the Asia region,
 *                      e.g. https://prooftamil-backend-xyz.asia-south1.run.app
 *   BACKEND_URL_US     Full Cloud Run URL for the US region,
 *                      e.g. https://prooftamil-backend-abc.us-central1.run.app
 *   BACKEND_URL        Single-instance fallback — used when the regional vars
 *                      above are not set (backwards-compatible).
 *
 * Optional:
 *   BACKEND_URL_PRIMARY  Override used for OAuth callbacks and other endpoints
 *                        that must always point to one fixed instance.
 *                        Defaults to BACKEND_URL_US → BACKEND_URL.
 */

const ASIA_CONTINENTS = new Set(['AS', 'OC']);

/** Appends /api/v1 to a base URL if not already present. */
function normalizeApiUrl(url) {
  const base = (url || '').replace(/\/$/, '');
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
}

/**
 * Returns the backend /api/v1 URL appropriate for the request's geographic
 * origin, determined from Vercel's x-vercel-ip-continent header.
 *
 * Falls back to the single BACKEND_URL when regional env vars are not set,
 * so existing single-instance deployments are unaffected.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getRegionalBackendUrl(req) {
  const asiaUrl = process.env.BACKEND_URL_ASIA || '';
  const usUrl   = process.env.BACKEND_URL_US   || '';

  // If either regional URL is absent, fall back to the single BACKEND_URL.
  if (!asiaUrl || !usUrl) {
    return normalizeApiUrl(process.env.BACKEND_URL || 'http://localhost:8080');
  }

  const continent = (
    (req && req.headers && req.headers['x-vercel-ip-continent']) || ''
  ).toUpperCase();

  const country = (
    (req && req.headers && req.headers['x-vercel-ip-country']) || ''
  ).toUpperCase();

  // Prefer continent header; use country as a secondary signal when continent
  // is absent (some edge runtimes / local tunnels may not set it).
  const isAsia = ASIA_CONTINENTS.has(continent) ||
    (!continent && isAsianCountry(country));

  return normalizeApiUrl(isAsia ? asiaUrl : usUrl);
}

/**
 * Secondary country-based heuristic used when the continent header is absent.
 * Covers common Asia-Pacific countries.
 */
const ASIA_COUNTRIES = new Set([
  'IN', 'SG', 'MY', 'TH', 'PH', 'ID', 'VN', 'KH', 'MM', 'LA', 'BN',
  'CN', 'HK', 'TW', 'JP', 'KR', 'MN',
  'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF',
  'AU', 'NZ', 'FJ', 'PG', 'WS',
]);
function isAsianCountry(code) {
  return ASIA_COUNTRIES.has(code);
}

/**
 * Returns the primary (non-regional) backend URL.
 * Used for OAuth callbacks and other endpoints where the URL must be a
 * pre-registered, fixed value regardless of the requester's location.
 *
 * Priority: BACKEND_URL_PRIMARY → BACKEND_URL_US → BACKEND_URL
 *
 * @returns {string}
 */
function getPrimaryBackendUrl() {
  const url =
    process.env.BACKEND_URL_PRIMARY ||
    process.env.BACKEND_URL_US ||
    process.env.BACKEND_URL ||
    'http://localhost:8080';
  return normalizeApiUrl(url);
}

module.exports = { getRegionalBackendUrl, getPrimaryBackendUrl };
