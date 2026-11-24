// Decorator: wraps a CatalogService and memoises the two hot read paths (listing and
// categories) for a few seconds. Any product change event drops the cache, so the admin
// never sees stale data. Same interface as the wrapped service; callers can't tell.
class CachedCatalogService {
  constructor(inner, { events, ttlMs }) {
    this.inner = inner;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    events.on("product.changed", () => this.cache.clear());
    // Everything not overridden goes straight through.
    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        const v = inner[prop];
        return typeof v === "function" ? v.bind(inner) : v;
      },
    });
  }

  async memo(key, compute) {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await compute();
    this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }

  list(query, paging, paged) {
    return this.memo(`list:${JSON.stringify([query, paging, paged])}`, () => this.inner.list(query, paging, paged));
  }
  categories() {
    return this.memo("categories", () => this.inner.categories());
  }
  get stats() {
    return { entries: this.cache.size };
  }
}

module.exports = { CachedCatalogService };
