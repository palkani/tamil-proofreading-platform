/**
 * In-memory token bucket.
 *
 * PRODUCTION CAVEAT: this is per-process. On serverless or multi-instance
 * deploys each instance keeps its own buckets, so the effective limit is
 * `capacity × instances`. That is fine as an abuse speed-bump but is not a
 * quota. Swap in Upstash Redis before this matters — see CHATBOT_README.md.
 */


const buckets = new Map();

/** Buckets idle for longer than this are dropped so the Map cannot grow without bound. */
const SWEEP_AFTER_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < SWEEP_AFTER_MS) return;
  lastSweep = now;

  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > SWEEP_AFTER_MS) buckets.delete(key);
  }
}


/**
 * Consume one token from `key`'s bucket.
 *
 * Refill is continuous rather than windowed: a fixed window lets a caller fire
 * `2 × capacity` across the boundary, which is exactly the burst we care about.
 */
function consume(key, capacity, windowMs) {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: now };
  const refillRate = capacity / windowMs;

  bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.lastRefill) * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return { ok: false, retryAfter: Math.ceil((1 - bucket.tokens) / refillRate / 1000) };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { ok: true, retryAfter: 0 };
}

/** Exposed for tests. */
function reset() {
  buckets.clear();
}

module.exports = { consume, reset };
