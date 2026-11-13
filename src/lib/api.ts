import type { CategoryId, CommentType, Incident, IncidentComment } from "./incidents";

const configuredBase = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.trim();
// Production intentionally defaults to the current origin. Its reverse proxy
// routes /api to the backend so the HttpOnly anonymous cookie remains first-party.
export const API_BASE_URL = configuredBase?.replace(/\/$/, "") ?? "";

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly fieldErrors?: Record<string, string>,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface PublicIncident extends Omit<Incident, "id" | "incidentAt" | "createdAt" | "editedAt"> {
  incidentAt: string;
  createdAt: string;
  editedAt?: string;
}

interface PublicComment extends Omit<IncidentComment, "incidentId" | "createdAt"> {
  trackingId: string;
  createdAt: string;
}

function incidentFromApi(value: PublicIncident): Incident {
  return {
    ...value,
    id: value.trackingId.toLowerCase(),
    incidentAt: Date.parse(value.incidentAt),
    createdAt: Date.parse(value.createdAt),
    editedAt: value.editedAt ? Date.parse(value.editedAt) : undefined,
  };
}

function commentFromApi(value: PublicComment): IncidentComment {
  return {
    ...value,
    incidentId: value.trackingId.toLowerCase(),
    createdAt: Date.parse(value.createdAt),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Backend-এর সঙ্গে সংযোগ করা যাচ্ছে না। Backend চালু আছে কি না দেখুন।",
      0,
    );
  }

  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as {
    error?: {
      code?: string;
      message?: string;
      fieldErrors?: Record<string, string>;
      details?: Record<string, unknown>;
    };
  } | null;
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(
      error?.code ?? "HTTP_ERROR",
      error?.message ?? "অনুরোধটি সম্পন্ন করা যায়নি।",
      response.status,
      error?.fieldErrors,
      error?.details,
    );
  }
  return data as T;
}

function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export interface IncidentListParams {
  q?: string;
  category?: CategoryId;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sort?: "newest" | "oldest";
  minLat?: number;
  minLng?: number;
  maxLat?: number;
  maxLng?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface TrackResult {
  incident: Incident;
  status: "published" | "hidden" | "deleted";
  versions: Array<{
    version: number;
    title: string;
    description: string;
    safetyTip?: string;
    savedAt: number;
  }>;
  edit: { allowed: boolean; deadline: number; remainingSeconds: number; maxChangeRatio: number };
}

export const api = {
  async listIncidents(params: IncidentListParams = {}) {
    const result = await request<{ items: PublicIncident[]; pagination: Pagination }>(
      `/api/incidents${query({ ...params })}`,
    );
    return { ...result, items: result.items.map(incidentFromApi) };
  },

  async getIncident(trackingId: string) {
    const result = await request<{ incident: PublicIncident }>(
      `/api/incidents/${encodeURIComponent(trackingId.toUpperCase())}`,
    );
    return incidentFromApi(result.incident);
  },

  async createIncident(input: {
    title: string;
    description: string;
    category: CategoryId;
    incidentAt: string;
    lat: number;
    lng: number;
    roadName: string;
    areaName: string;
    safetyTip?: string;
    captchaToken: string;
  }) {
    const result = await request<{
      incident: PublicIncident;
      credentials: { trackingId: string; secret: string };
    }>("/api/incidents", { method: "POST", body: JSON.stringify(input) });
    return { ...result, incident: incidentFromApi(result.incident) };
  },

  async setVote(trackingId: string, type: "support" | "dispute") {
    return request(`/api/incidents/${encodeURIComponent(trackingId)}/vote`, {
      method: "POST",
      body: JSON.stringify({ type }),
    });
  },

  removeVote(trackingId: string) {
    return request(`/api/incidents/${encodeURIComponent(trackingId)}/vote`, { method: "DELETE" });
  },

  reportIncident(trackingId: string, reason: string) {
    return request(`/api/incidents/${encodeURIComponent(trackingId)}/report`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  async listComments(trackingId: string, page = 1) {
    const result = await request<{ items: PublicComment[]; pagination: Pagination }>(
      `/api/incidents/${encodeURIComponent(trackingId)}/comments${query({ page, pageSize: 10 })}`,
    );
    return { ...result, items: result.items.map(commentFromApi) };
  },

  async createComment(
    trackingId: string,
    input: { type: CommentType; text: string; captchaToken: string },
  ) {
    const result = await request<{
      comment: PublicComment;
      quota: { limit: number; used: number; remaining: number; resetsAt: string };
    }>(`/api/incidents/${encodeURIComponent(trackingId)}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { ...result, comment: commentFromApi(result.comment) };
  },

  deleteComment(commentId: string) {
    return request<void>(`/api/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
  },

  reportComment(commentId: string, reason: string) {
    return request(`/api/comments/${encodeURIComponent(commentId)}/report`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  async track(trackingId: string, secret: string): Promise<TrackResult> {
    const result = await request<{
      incident: PublicIncident;
      status: TrackResult["status"];
      versions: Array<Omit<TrackResult["versions"][number], "savedAt"> & { savedAt: string }>;
      edit: Omit<TrackResult["edit"], "deadline"> & { deadline: string };
    }>("/api/track", { method: "POST", body: JSON.stringify({ trackingId, secret }) });
    return {
      ...result,
      incident: incidentFromApi(result.incident),
      versions: result.versions.map((version) => ({
        ...version,
        savedAt: Date.parse(version.savedAt),
      })),
      edit: { ...result.edit, deadline: Date.parse(result.edit.deadline) },
    };
  },

  async editIncident(
    trackingId: string,
    input: { secret: string; title: string; description: string; safetyTip?: string },
  ) {
    const result = await request<{
      incident: PublicIncident;
      version: { version: number; savedAt: string };
    }>(`/api/incidents/${encodeURIComponent(trackingId)}/edit`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return {
      ...result,
      incident: incidentFromApi(result.incident),
      version: { ...result.version, savedAt: Date.parse(result.version.savedAt) },
    };
  },

  async reverseGeocode(lat: number, lng: number) {
    return request<{ location: { roadName: string; areaName: string } }>(
      `/api/geo/reverse${query({ lat, lng })}`,
    );
  },
};

export function apiMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "অনুরোধটি সম্পন্ন করা যায়নি।";
}
