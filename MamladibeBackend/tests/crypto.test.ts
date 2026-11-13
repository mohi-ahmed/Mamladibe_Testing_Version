import { describe, expect, it } from "vitest";

import {
  generateReporterSecret,
  generateTrackingId,
  hashReporterSecret,
  verifyReporterSecret,
} from "../src/lib/crypto.js";

const pepper = "test-reporter-secret-pepper-1234567890";

describe("reporter credentials", () => {
  it("generates frontend-compatible credentials", () => {
    expect(generateTrackingId()).toMatch(/^MD-[A-Z2-9]{6}$/);
    expect(generateReporterSecret()).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  });

  it("stores a one-way hash and compares normalized input", async () => {
    const hash = await hashReporterSecret("ABCD-EFGH-JKLM-NPQR", pepper);
    expect(hash).not.toContain("ABCD");
    await expect(verifyReporterSecret("abcd-efgh-jklm-npqr", hash, pepper)).resolves.toBe(true);
    await expect(verifyReporterSecret("WRONG-EFGH-JKLM-NPQR", hash, pepper)).resolves.toBe(false);
  });
});
