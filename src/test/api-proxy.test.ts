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
      return new Response("ok", { status: 201 });
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
    expect(fetcher).toHaveBeenCalledOnce();
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
