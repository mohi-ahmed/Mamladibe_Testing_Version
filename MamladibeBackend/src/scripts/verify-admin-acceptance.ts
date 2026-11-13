import { generate } from "otplib";

import { buildApp } from "../create-app.js";
import { loadConfig } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import {
  createTotpEnrollment,
  encryptTotpSecret,
  hashAdminPassword,
} from "../lib/admin-security.js";
import {
  AdminSessionModel,
  AdminUserModel,
  AuditLogModel,
  BlockModel,
  PlatformSettingsModel,
} from "../models/index.js";
import { InMemoryRateLimitStore } from "../services/rate-limit.service.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cookieHeader(response: {
  headers: Record<string, string | string[] | number | undefined>;
}) {
  const value = response.headers["set-cookie"];
  const cookies = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

const config = loadConfig();
const origin = config.allowedOrigins[0];
assert(origin, "At least one allowed origin is required.");
const marker = `acceptance-${Date.now()}`;
const emails = {
  super: `${marker}-super@example.test`,
  moderator: `${marker}-moderator@example.test`,
  lock: `${marker}-lock@example.test`,
};
const password = "Acceptance-only-strong-password-42";

await connectDatabase(config.MONGODB_URI, false);
let app: Awaited<ReturnType<typeof buildApp>> | undefined;
try {
  const enrollments = {
    super: createTotpEnrollment(emails.super),
    moderator: createTotpEnrollment(emails.moderator),
    lock: createTotpEnrollment(emails.lock),
  };
  const passwordHash = await hashAdminPassword(password);
  const created = await AdminUserModel.create([
    {
      email: emails.super,
      passwordHash,
      role: "super_admin",
      totpSecretEncrypted: encryptTotpSecret(enrollments.super.secret, config.TOTP_ENCRYPTION_KEY),
      active: true,
      enrolledAt: new Date(),
    },
    {
      email: emails.moderator,
      passwordHash,
      role: "moderator",
      totpSecretEncrypted: encryptTotpSecret(
        enrollments.moderator.secret,
        config.TOTP_ENCRYPTION_KEY,
      ),
      active: true,
      enrolledAt: new Date(),
    },
    {
      email: emails.lock,
      passwordHash,
      role: "moderator",
      totpSecretEncrypted: encryptTotpSecret(enrollments.lock.secret, config.TOTP_ENCRYPTION_KEY),
      active: true,
      enrolledAt: new Date(),
    },
  ]);
  app = await buildApp({ config, logger: false, rateLimit: new InMemoryRateLimitStore() });

  const invalidTotp = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    headers: { origin },
    payload: { email: emails.super, password, totpCode: "000000" },
  });
  assert(invalidTotp.statusCode === 401, "Invalid TOTP must return 401.");
  assert(!invalidTotp.headers["set-cookie"], "Invalid TOTP must not create cookies.");

  const superCode = await generate({ secret: enrollments.super.secret, digits: 6, period: 30 });
  const superLogin = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    headers: { origin },
    payload: { email: emails.super, password, totpCode: superCode },
  });
  assert(superLogin.statusCode === 200, "Super Admin login failed.");
  const superCookie = cookieHeader(superLogin);
  const superBody = superLogin.json();
  assert(superCookie.includes("mdb_admin="), "Session cookie missing.");
  assert(superCookie.includes("mdb_admin_csrf="), "CSRF cookie missing.");

  const sessionResponse = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie: superCookie },
  });
  assert(sessionResponse.statusCode === 200, "Current session failed.");

  const missingCsrf = await app.inject({
    method: "POST",
    url: "/api/admin/blocks",
    headers: { origin, cookie: superCookie },
    payload: {
      targetType: "network_hash",
      targetRef: "a".repeat(64),
      mode: "temporary",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      reason: "Acceptance test block",
    },
  });
  assert(
    missingCsrf.statusCode === 403 && missingCsrf.json().error.code === "CSRF_INVALID",
    "Missing CSRF must be rejected.",
  );

  const createdBlock = await app.inject({
    method: "POST",
    url: "/api/admin/blocks",
    headers: { origin, cookie: superCookie, "x-csrf-token": superBody.csrfToken },
    payload: {
      targetType: "network_hash",
      targetRef: "a".repeat(64),
      mode: "temporary",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      reason: "Acceptance test block",
    },
  });
  assert(createdBlock.statusCode === 201, "Valid Super Admin mutation failed.");

  const moderatorCode = await generate({
    secret: enrollments.moderator.secret,
    digits: 6,
    period: 30,
  });
  const moderatorLogin = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    headers: { origin },
    payload: { email: emails.moderator, password, totpCode: moderatorCode },
  });
  assert(moderatorLogin.statusCode === 200, "Moderator login failed.");
  const moderatorBody = moderatorLogin.json();
  const forbidden = await app.inject({
    method: "POST",
    url: "/api/admin/blocks",
    headers: {
      origin,
      cookie: cookieHeader(moderatorLogin),
      "x-csrf-token": moderatorBody.csrfToken,
    },
    payload: {
      targetType: "network_hash",
      targetRef: "b".repeat(64),
      mode: "permanent",
      reason: "RBAC acceptance check",
    },
  });
  assert(
    forbidden.statusCode === 403 && forbidden.json().error.code === "FORBIDDEN",
    "Moderator must not create blocks.",
  );

  const forbiddenSettings = await app.inject({
    method: "GET",
    url: "/api/admin/settings",
    headers: { cookie: cookieHeader(moderatorLogin) },
  });
  assert(forbiddenSettings.statusCode === 403, "Moderator must not read platform settings.");

  const settingsUpdate = await app.inject({
    method: "PATCH",
    url: "/api/admin/settings",
    headers: { origin, cookie: superCookie, "x-csrf-token": superBody.csrfToken },
    payload: { freezeComments: true, reason: "Acceptance test settings change" },
  });
  assert(settingsUpdate.statusCode === 200, "Super Admin settings update failed.");
  assert(settingsUpdate.json().freezeComments === true, "Settings update was not persisted.");

  const settingsRestore = await app.inject({
    method: "PATCH",
    url: "/api/admin/settings",
    headers: { origin, cookie: superCookie, "x-csrf-token": superBody.csrfToken },
    payload: { freezeComments: false, reason: "Acceptance test settings restore" },
  });
  assert(settingsRestore.statusCode === 200, "Settings restore failed.");

  for (let attempt = 1; attempt <= config.ADMIN_LOGIN_MAX_FAILURES; attempt += 1) {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: { origin },
      payload: { email: emails.lock, password: "Wrong-acceptance-password", totpCode: "000000" },
    });
    const expected = attempt === config.ADMIN_LOGIN_MAX_FAILURES ? 423 : 401;
    assert(
      response.statusCode === expected,
      `Lockout attempt ${attempt} returned ${response.statusCode}.`,
    );
  }
  const lockedCode = await generate({ secret: enrollments.lock.secret, digits: 6, period: 30 });
  const lockedLogin = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    headers: { origin },
    payload: { email: emails.lock, password, totpCode: lockedCode },
  });
  assert(lockedLogin.statusCode === 423, "Locked account accepted valid credentials.");

  const logout = await app.inject({
    method: "DELETE",
    url: "/api/admin/session",
    headers: { origin, cookie: superCookie, "x-csrf-token": superBody.csrfToken },
  });
  assert(logout.statusCode === 204, "Logout failed.");
  const afterLogout = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie: superCookie },
  });
  assert(afterLogout.statusCode === 401, "Revoked session remained active.");

  console.log("Admin acceptance passed: login, TOTP, session, CSRF, RBAC, lockout and logout.");
  console.log(`Temporary records verified: ${created.length} accounts; cleanup follows.`);
} finally {
  if (app) await app.close();
  const admins = await AdminUserModel.collection
    .find({ email: { $in: Object.values(emails) } })
    .toArray();
  const adminIds = admins.map((admin) => admin._id);
  await Promise.all([
    AdminSessionModel.collection.deleteMany({ adminId: { $in: adminIds } }),
    AuditLogModel.collection.deleteMany({ adminId: { $in: adminIds } }),
    BlockModel.collection.deleteMany({
      reason: { $in: ["Acceptance test block", "RBAC acceptance check"] },
    }),
    AdminUserModel.collection.deleteMany({ _id: { $in: adminIds } }),
  ]);
  await PlatformSettingsModel.updateOne(
    { _id: "platform" },
    { $set: { freezeIncidentPosting: false, freezeComments: false } },
    { upsert: true },
  );
  await disconnectDatabase();
}
