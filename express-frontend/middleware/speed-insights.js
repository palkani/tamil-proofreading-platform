/**
 * Vercel Speed Insights Middleware
 * 
 * This middleware injects the Speed Insights tracking script into HTML responses.
 * For Express apps, we include the script tag directly in the HTML output.
 * The script will be automatically injected before the closing body tag by the response handler.
 */

const SPEED_INSIGHTS_SCRIPT = `
<script>
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
</script>
<script defer src="/_vercel/speed-insights/script.js"><\/script>
`;

/**
 * Inject Speed Insights tracking script into HTML responses
 * This middleware intercepts the res.end and res.write methods to inject the script
 */
function injectSpeedInsights(req, res, next) {
  // Store the original end and write methods
  const originalEnd = res.end;
  const originalWrite = res.write;

  // Override res.write to inject script before closing body tag
  res.write = function (chunk, encoding, callback) {
    if (typeof chunk === 'string' && res.getHeader('content-type')?.includes('text/html')) {
      // Inject script before closing body tag
      chunk = chunk.replace('</body>', `${SPEED_INSIGHTS_SCRIPT}</body>`);
    }
    return originalWrite.call(this, chunk, encoding, callback);
  };

  // Override res.end to inject script if no write was called
  res.end = function (chunk, encoding, callback) {
    if (chunk && typeof chunk === 'string' && res.getHeader('content-type')?.includes('text/html')) {
      // Inject script before closing body tag
      chunk = chunk.replace('</body>', `${SPEED_INSIGHTS_SCRIPT}</body>`);
    }
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
}

module.exports = injectSpeedInsights;
