import { describe, expect, it } from "vitest";

import { InMemoryCommentQuotaStore } from "../src/services/quota.service.js";

describe("rolling comment quota", () => {
  it("rejects the sixth event in a rolling 24-hour window", async () => {
    const store = new InMemoryCommentQuotaStore();
    const now = new Date("2026-11-12T10:00:00.000Z");
    for (let index = 1; index <= 5; index += 1) {
      const decision = await store.reserve("actor", new Date(now.getTime() + index));
      expect(decision.allowed).toBe(true);
    }
    const rejected = await store.reserve("actor", new Date(now.getTime() + 10));
    expect(rejected).toMatchObject({ allowed: false, limit: 5 });
  });

  it("releases a reservation when persistence fails", async () => {
    const store = new InMemoryCommentQuotaStore();
    const reservation = await store.reserve("actor");
    expect(reservation.allowed).toBe(true);
    if (!reservation.allowed) throw new Error("Expected reservation");
    await store.release("actor", reservation.member);
    const next = await store.reserve("actor");
    expect(next).toMatchObject({ allowed: true, used: 1, remaining: 4 });
  });

  it("can enforce the same five-comment quota across changing actors on one network", async () => {
    const store = new InMemoryCommentQuotaStore();
    for (let index = 0; index < 5; index += 1) {
      const actor = await store.reserve(`actor-${index}`);
      const network = await store.reserve("network:shared-hash");
      expect(actor.allowed).toBe(true);
      expect(network.allowed).toBe(true);
    }
    await expect(store.reserve("actor-6")).resolves.toMatchObject({ allowed: true });
    await expect(store.reserve("network:shared-hash")).resolves.toMatchObject({ allowed: false });
  });
});
