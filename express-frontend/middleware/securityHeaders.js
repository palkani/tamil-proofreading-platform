/**
 * Security response headers — defence-in-depth for the marketing site,
 * app, and API. Mirrors what a SOC-2-aligned SaaS is expected to send.
 *
 * Headers applied:
 *   Strict-Transport-Security   Force HTTPS for 1 year including subdomains
 *   X-Content-Type-Options      Block MIME-sniffing (XSS carrier)
 *   X-Frame-Options             Deny embedding — anti-clickjacking
 *   Referrer-Policy             Don't leak the full URL cross-origin
 *   Permissions-Policy          Explicitly deny sensors we don't use;
 *                               allow microphone=self for voice typing
 *
 * We deliberately do NOT set Content-Security-Policy here — the site has
 * a lot of inline event handlers and third-party embeds (GA, Dodo checkout
 * redirect) that would need per-page tuning. Ship CSP as a separate item.
 */

function securityHeaders(req, res, next) {
  // Only send HSTS in production. Vercel terminates TLS in front of us,
  // and we trust the proxy (app.set('trust proxy', true)).
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), geolocation=(), microphone=(self), payment=(self), usb=()'
  );
  next();
}

module.exports = { securityHeaders };
