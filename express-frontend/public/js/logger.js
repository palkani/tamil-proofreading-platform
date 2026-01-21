// Lightweight client logger to keep DevTools console clean in production.
// Usage: logger.log(...), logger.warn(...), logger.debug(...), logger.error(...)
(() => {
  const isBrowser = typeof window !== 'undefined';
  const isLocalhost = isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const debugEnabled =
    isLocalhost ||
    (isBrowser && (window.localStorage?.getItem('DEBUG') === '1' || new URLSearchParams(window.location.search).get('debug') === '1'));

  const noop = () => {};

  // Hard-silence noisy logs in production by monkey-patching console.
  // This is the only reliable way to keep DevTools clean without touching every file.
  // Keep console.error intact so real failures are still visible.
  if (isBrowser && !debugEnabled && typeof window.console !== 'undefined') {
    try {
      const original = window.console;
      // Preserve original functions for potential debugging.
      if (!window.__ORIGINAL_CONSOLE__) {
        window.__ORIGINAL_CONSOLE__ = {
          log: original.log?.bind(original),
          debug: original.debug?.bind(original),
          warn: original.warn?.bind(original),
          info: original.info?.bind(original),
        };
      }
      original.log = noop;
      original.debug = noop;
      original.warn = noop;
      original.info = noop;
    } catch (_e) {
      // ignore
    }
  }

  const logger = {
    enabled: debugEnabled,
    log: debugEnabled ? (...args) => console.log(...args) : noop,
    debug: debugEnabled ? (...args) => console.debug(...args) : noop,
    warn: debugEnabled ? (...args) => console.warn(...args) : noop,
    // Keep errors visible even when debug is off (real failures).
    error: (...args) => console.error(...args),
  };

  if (isBrowser) {
    window.logger = logger;
  }
})();


