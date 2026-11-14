// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { proxyApiRequest } from "../lib/api-proxy";

describe("same-origin API proxy", () => {
  it("forwards the API path, query, method, cookies, origin, and body", async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://backend.example/api/incidents?page=2");
      expect(request.method).toBe("POST");
      expect(request.headers.get("cookie")).toBe("mdb_anon=test-cookie");
      expect(request.headers.get("origin")).toBe("https://mamladibe.example");
      expect(await request.text()).toBe('{"title":"test"}');
      return new Response('{"created":true}', {
        status: 201,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-encoding": "gzip",
          "content-length": "999",
          "set-cookie": "mdb_anon=test-cookie; Path=/; HttpOnly",
        },
      });
    });
    const request = new Request("https://mamladibe.example/api/incidents?page=2", {
      method: "POST",
      headers: {
        cookie: "mdb_anon=test-cookie",
        origin: "https://mamladibe.example",
        "content-type": "application/json",
      },
      body: '{"title":"test"}',
    });

    const response = await proxyApiRequest(request, "https://backend.example", fetcher);
    expect(response?.status).toBe(201);
    await expect(response?.json()).resolves.toEqual({ created: true });
    expect(response?.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response?.headers.get("set-cookie")).toContain("mdb_anon=test-cookie");
    expect(response?.headers.has("content-encoding")).toBe(false);
    expect(response?.headers.has("content-length")).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns a bodyless response for HEAD and no-content statuses", async () => {
    const head = await proxyApiRequest(
      new Request("https://mamladibe.example/api/health", { method: "HEAD" }),
      "https://backend.example",
      async () => new Response("ignored"),
    );
    expect(await head?.text()).toBe("");

    const noContent = await proxyApiRequest(
      new Request("https://mamladibe.example/api/vote", { method: "DELETE" }),
      "https://backend.example",
      async () => new Response(null, { status: 204 }),
    );
    expect(noContent?.status).toBe(204);
    expect(await noContent?.text()).toBe("");
  });

  it("ignores non-API traffic and fails closed when production proxy config is missing", async () => {
    await expect(
      proxyApiRequest(new Request("https://mamladibe.example/map"), null),
    ).resolves.toBeNull();
    const response = await proxyApiRequest(
      new Request("https://mamladibe.example/api/health"),
      null,
    );
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE" },
    });
  });
});
