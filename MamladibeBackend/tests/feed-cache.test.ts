import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryFeedCache } from "../src/services/feed-cache.service.js";

describe("public feed cache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("caches for twenty seconds and invalidates explicitly", async () => {
    const cache = new InMemoryFeedCache();
    await cache.set({ total: 7 });
    await expect(cache.get()).resolves.toEqual({ total: 7 });
    await cache.invalidate();
    await expect(cache.get()).resolves.toBeNull();
  });

  it("expires stale feed values", async () => {
    const cache = new InMemoryFeedCache();
    await cache.set({ total: 7 });
    vi.advanceTimersByTime(20_001);
    await expect(cache.get()).resolves.toBeNull();
  });
});
