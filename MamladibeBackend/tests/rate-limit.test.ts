import { describe, expect, it } from "vitest";

import { enforceRateLimit, InMemoryRateLimitStore } from "../src/services/rate-limit.service.js";

describe("public action rate limits", () => {
  it("keeps vote network quotas independent per incident subject", async () => {
    const store = new InMemoryRateLimitStore();
    for (let index = 0; index < 30; index += 1) {
      await enforceRateLimit(store, "vote", "network-hash:MD-ONE", "network");
    }
    await expect(
      enforceRateLimit(store, "vote", "network-hash:MD-ONE", "network"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(
      enforceRateLimit(store, "vote", "network-hash:MD-TWO", "network"),
    ).resolves.toBeUndefined();
  });

  it("returns the contract error after the incident policy is exhausted", async () => {
    const store = new InMemoryRateLimitStore();
    for (let index = 0; index < 5; index += 1) {
      await expect(enforceRateLimit(store, "incident", "actor")).resolves.toBeUndefined();
    }
    await expect(enforceRateLimit(store, "incident", "actor")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      options: { details: { retryAfterSeconds: expect.any(Number) } },
    });
  });

  it("limits a network even when cookie actors change", async () => {
    const store = new InMemoryRateLimitStore();
    for (let index = 0; index < 5; index += 1) {
      await expect(
        enforceRateLimit(store, "incident", "shared-network", "network"),
      ).resolves.toBeUndefined();
    }
    await expect(
      enforceRateLimit(store, "incident", "shared-network", "network"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("uses the stricter network vote policy", async () => {
    const store = new InMemoryRateLimitStore();
    for (let index = 0; index < 30; index += 1) {
      await expect(
        enforceRateLimit(store, "vote", "shared-network", "network"),
      ).resolves.toBeUndefined();
    }
    await expect(
      enforceRateLimit(store, "vote", "shared-network", "network"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });
});
