import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/create-app.js";
import { loadConfig } from "../src/config/env.js";

describe("admin API authentication and authorization contract", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildApp({
      config: loadConfig({ NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:5173" }),
      logger: false,
    });
  });
  afterEach(async () => app.close());

  it("registers all frozen admin contract endpoints", () => {
    const routes = [
      ["POST", "/api/admin/login"],
      ["GET", "/api/admin/session"],
      ["DELETE", "/api/admin/session"],
      ["POST", "/api/admin/enrol/start"],
      ["POST", "/api/admin/enrol/verify"],
      ["GET", "/api/admin/dashboard"],
      ["GET", "/api/admin/incidents"],
      ["GET", "/api/admin/incidents/:trackingId"],
      ["POST", "/api/admin/incidents"],
      ["PATCH", "/api/admin/incidents/:trackingId"],
      ["PATCH", "/api/admin/incidents/:trackingId/redaction"],
      ["DELETE", "/api/admin/incidents/:trackingId/permanent"],
      ["GET", "/api/admin/comments"],
      ["GET", "/api/admin/comments/:commentId"],
      ["PATCH", "/api/admin/comments/:commentId"],
      ["DELETE", "/api/admin/comments/:commentId/permanent"],
      ["GET", "/api/admin/flags"],
      ["GET", "/api/admin/flags/:flagId"],
      ["PATCH", "/api/admin/flags/:flagId"],
      ["GET", "/api/admin/activity"],
      ["GET", "/api/admin/actors/:anonymousId/notes"],
      ["POST", "/api/admin/actors/:anonymousId/notes"],
      ["POST", "/api/admin/bulk-actions"],
      ["GET", "/api/admin/blocks"],
      ["POST", "/api/admin/blocks"],
      ["DELETE", "/api/admin/blocks/:blockId"],
      ["GET", "/api/admin/users"],
      ["GET", "/api/admin/users/:adminId"],
      ["POST", "/api/admin/users"],
      ["PATCH", "/api/admin/users/:adminId"],
      ["POST", "/api/admin/users/:adminId/reset-2fa"],
      ["GET", "/api/admin/audit"],
      ["GET", "/api/admin/settings"],
      ["PATCH", "/api/admin/settings"],
    ] as const;
    for (const [method, url] of routes) expect(app.hasRoute({ method, url })).toBe(true);
  });

  it("returns 401 and no-store headers without an admin session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/admin/dashboard" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("rejects login before credential processing when Origin is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { email: "admin@example.com", password: "a-secure-password", totpCode: "123456" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "ORIGIN_NOT_ALLOWED" } });
  });

  it("rejects malformed login data without touching the database", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "bad", password: "short", totpCode: "x", unexpected: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
