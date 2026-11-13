import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";

function emptyListResponse() {
  return new Response(
    JSON.stringify({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("incident list API queries", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends search, category, date and pagination to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyListResponse());
    vi.stubGlobal("fetch", fetchMock);

    await api.listIncidents({
      q: "ফার্মগেট",
      category: "accident",
      from: "2026-11-01T00:00:00.000Z",
      page: 3,
      pageSize: 20,
      sort: "newest",
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: "ফার্মগেট",
      category: "accident",
      from: "2026-11-01T00:00:00.000Z",
      page: "3",
      pageSize: "20",
      sort: "newest",
    });
  });

  it("sends all four map viewport bounds together", async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyListResponse());
    vi.stubGlobal("fetch", fetchMock);

    await api.listIncidents({
      minLat: 23.7,
      minLng: 90.3,
      maxLat: 23.9,
      maxLng: 90.5,
      page: 1,
      pageSize: 100,
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      minLat: "23.7",
      minLng: "90.3",
      maxLat: "23.9",
      maxLng: "90.5",
      page: "1",
      pageSize: "100",
    });
  });
});
