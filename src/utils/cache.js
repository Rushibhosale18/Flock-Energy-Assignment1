/**
 * High-performance In-Memory TTL Cache with Stale-While-Revalidate (SWR)
 * Shields the fragile legacy portal from high-frequency redundant queries.
 */
class MemoryCache {
    /**
     * @param {Object} [options]
     * @param {number} [options.defaultTtlMs=60000] Default TTL in milliseconds (default: 60s)
     * @param {number} [options.staleTtlMs=120000] Maximum age to serve stale while refreshing in background (default: 120s)
     * @param {number} [options.maxItems=500] Maximum entries to prevent memory leaks (LRU eviction)
     */
    constructor(options = {}) {
        this.defaultTtlMs = options.defaultTtlMs || 60000;
        this.staleTtlMs = options.staleTtlMs || 120000;
        this.maxItems = options.maxItems || 500;
        this.store = new Map();
        
        // Metrics
        this.hits = 0;
        this.misses = 0;
        this.refreshes = 0;
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            this.misses++;
            return null;
        }

        const now = Date.now();
        const age = now - entry.timestamp;

        // Fresh cache hit
        if (age < entry.ttl) {
            this.hits++;
            return { data: entry.data, isStale: false };
        }

        // Stale cache hit within grace period
        if (age < entry.staleTtl) {
            this.hits++;
            return { data: entry.data, isStale: true };
        }

        // Expired completely
        this.store.delete(key);
        this.misses++;
        return null;
    }

    set(key, data, ttlMs = null) {
        // Enforce max capacity (evict oldest entry)
        if (this.store.size >= this.maxItems) {
            const oldestKey = this.store.keys().next().value;
            this.store.delete(oldestKey);
        }

        const ttl = ttlMs || this.defaultTtlMs;
        this.store.set(key, {
            data,
            timestamp: Date.now(),
            ttl,
            staleTtl: ttl + this.staleTtlMs
        });
    }

    del(key) {
        this.store.delete(key);
    }

    clear() {
        this.store.clear();
    }

    getStats() {
        return {
            items_count: this.store.size,
            hits: this.hits,
            misses: this.misses,
            hit_ratio: (this.hits + this.misses) > 0 ? parseFloat((this.hits / (this.hits + this.misses)).toFixed(3)) : 0
        };
    }
}

module.exports = MemoryCache;
