import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/create-app.js";
import { loadConfig } from "../src/config/env.js";

describe("HTTP contract", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ALLOWED_ORIGINS: "http://localhost:5173",
    });
    app = await buildApp({ config, logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns the standard envelope for an unknown API route", async () => {
    const response = await app.inject({ method: "GET", url: "/api/unknown" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "Resource not found." },
    });
    expect(response.json().error.requestId).toMatch(/^req_/);
  });

  it("registers every public contract endpoint", () => {
    const routes = [
      ["GET", "/api/health"],
      ["POST", "/api/identity"],
      ["GET", "/api/feed"],
      ["GET", "/api/incidents"],
      ["POST", "/api/incidents"],
      ["GET", "/api/incidents/:trackingId"],
      ["POST", "/api/incidents/:trackingId/vote"],
      ["DELETE", "/api/incidents/:trackingId/vote"],
      ["POST", "/api/incidents/:trackingId/report"],
      ["GET", "/api/incidents/:trackingId/comments"],
      ["POST", "/api/incidents/:trackingId/comments"],
      ["DELETE", "/api/comments/:commentId"],
      ["POST", "/api/comments/:commentId/report"],
      ["POST", "/api/track"],
      ["PATCH", "/api/incidents/:trackingId/edit"],
      ["GET", "/api/geo/reverse"],
    ] as const;

    for (const [method, url] of routes) {
      expect(app.hasRoute({ method, url })).toBe(true);
    }
  });

  it("returns dependency-safe health failure before MongoDB is connected", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("rejects a public mutation without an allowed Origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/incidents",
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "ORIGIN_NOT_ALLOWED" } });
  });
});
