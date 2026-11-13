import { generate } from "otplib";
import { describe, expect, it } from "vitest";

import {
  adminSessionIsExpired,
  assertAdminRole,
  csrfIsValid,
} from "../src/middleware/admin-auth.js";
import {
  createTotpEnrollment,
  decryptTotpSecret,
  encryptTotpSecret,
  hashAdminPassword,
  hashOpaqueToken,
  safeTokenEqual,
  verifyAdminPassword,
  verifyTotp,
} from "../src/lib/admin-security.js";
import { nextLoginFailure } from "../src/services/admin-auth.service.js";

describe("administrator security primitives", () => {
  it("uses Argon2id and verifies without retaining the password", async () => {
    const encoded = await hashAdminPassword("correct-horse-battery-staple");
    expect(encoded).toMatch(/^\$argon2id\$/);
    await expect(verifyAdminPassword(encoded, "correct-horse-battery-staple")).resolves.toBe(true);
    await expect(verifyAdminPassword(encoded, "wrong-password-value")).resolves.toBe(false);
  });

  it("encrypts TOTP secrets with authenticated encryption", () => {
    const key = "test-encryption-key-with-at-least-32-characters";
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptTotpSecret(encrypted, key)).toBe("JBSWY3DPEHPK3PXP");
    const parts = encrypted.split(".");
    parts[2] = `${parts[2]!.startsWith("A") ? "B" : "A"}${parts[2]!.slice(1)}`;
    expect(() => decryptTotpSecret(parts.join("."), key)).toThrow();
  });

  it("accepts a current six-digit TOTP and exposes a Mamladibe enrolment URI", async () => {
    const enrollment = createTotpEnrollment("admin@example.com");
    const token = await generate({ secret: enrollment.secret, digits: 6, period: 30 });
    expect(enrollment.otpauthUri).toContain("otpauth://totp/Mamladibe");
    await expect(verifyTotp(enrollment.secret, token)).resolves.toBe(true);
    await expect(verifyTotp(enrollment.secret, "000000")).resolves.toBe(false);
  });

  it("hashes opaque tokens and compares CSRF tokens safely", () => {
    expect(hashOpaqueToken("token")).toMatch(/^[a-f\d]{64}$/);
    expect(safeTokenEqual("same-token", "same-token")).toBe(true);
    expect(safeTokenEqual("same-token", "different-token")).toBe(false);
  });

  it("enforces moderator and Super Admin role boundaries", () => {
    expect(() => assertAdminRole("moderator", ["moderator", "super_admin"])).not.toThrow();
    expect(() => assertAdminRole("moderator", ["super_admin"])).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN", status: 403 }),
    );
  });

  it("locks exactly on the fifth consecutive failure for fifteen minutes", () => {
    const now = new Date("2026-11-13T10:00:00.000Z");
    expect(nextLoginFailure(3, 5, 900, now)).toEqual({
      failedLogins: 4,
      lockedUntil: undefined,
    });
    expect(nextLoginFailure(4, 5, 900, now)).toEqual({
      failedLogins: 5,
      lockedUntil: new Date("2026-11-13T10:15:00.000Z"),
    });
  });

  it("enforces both absolute and idle session expiry", () => {
    const now = new Date("2026-11-13T10:00:00.000Z");
    expect(
      adminSessionIsExpired(
        new Date("2026-11-13T18:00:00.000Z"),
        new Date("2026-11-13T09:31:00.000Z"),
        1_800,
        now,
      ),
    ).toBe(false);
    expect(
      adminSessionIsExpired(
        new Date("2026-11-13T18:00:00.000Z"),
        new Date("2026-11-13T09:30:00.000Z"),
        1_800,
        now,
      ),
    ).toBe(true);
    expect(
      adminSessionIsExpired(
        new Date("2026-11-13T10:00:00.000Z"),
        new Date("2026-11-13T09:59:00.000Z"),
        1_800,
        now,
      ),
    ).toBe(true);
  });

  it("requires matching CSRF cookie, header and stored hash", () => {
    const token = "csrf-test-token";
    expect(csrfIsValid(token, token, hashOpaqueToken(token))).toBe(true);
    expect(csrfIsValid(token, "wrong", hashOpaqueToken(token))).toBe(false);
    expect(csrfIsValid(undefined, token, hashOpaqueToken(token))).toBe(false);
  });
});
