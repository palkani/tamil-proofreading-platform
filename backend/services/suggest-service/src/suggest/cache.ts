type CacheEntry<T> = {
  value: T;
  ts: number;
};

export class LruCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private maxEntries: number;
  private ttlMs: number;

  constructor(opts?: { maxEntries?: number; ttlMs?: number }) {
    this.maxEntries = Math.max(50, Math.min(opts?.maxEntries ?? 2000, 20000));
    this.ttlMs = Math.max(1_000, Math.min(opts?.ttlMs ?? 300_000, 3_600_000));
  }

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.map.delete(key);
      return null;
    }
    // Refresh LRU order.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, { value, ts: Date.now() });
    this.evictIfNeeded();
  }

  private evictIfNeeded() {
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) return;
      this.map.delete(oldest.value);
    }
  }
}
