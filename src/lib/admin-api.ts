import { API_BASE_URL, ApiError, type Pagination } from "./api";

export type AdminRole = "moderator" | "super_admin";
export type ContentStatus = "published" | "hidden" | "deleted";

export interface AdminIdentity {
  id: string;
  email: string;
  role: AdminRole;
}

export interface AdminSession {
  admin: AdminIdentity;
  csrfToken: string;
  session: { absoluteExpiresAt: string; idleExpiresAt: string };
}

export interface AdminIncident {
  trackingId: string;
  title: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  roadName: string;
  areaName: string;
  incidentAt: string;
  createdAt: string;
  safetyTip?: string;
  status: ContentStatus;
  source: "public" | "admin";
  adminLabel?: "official" | "test";
  anonymousId?: string;
  support: number;
  dispute: number;
  flags: number;
  commentCount: number;
  isEdited: boolean;
  byModerator: boolean;
}

export interface AdminComment {
  _id: string;
  incidentId: string;
  type: string;
  text: string;
  status: ContentStatus;
  anonymousId?: string;
  createdAt: string;
}

export interface AdminFlag {
  _id: string;
  targetType: "incident" | "comment";
  targetId: string;
  reason: string;
  reviewStatus: "pending" | "reviewed";
  outcome?: "kept" | "hidden" | "removed";
  anonymousId?: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  active: boolean;
  lastLoginAt?: string;
  enrollmentExpiresAt?: string;
  createdAt: string;
}

export interface AdminActivity {
  actor: { anonymousId: string; firstSeenAt: string; lastSeenAt: string };
  timeline: Array<{ type: string; id: string; at: string }>;
}

export interface ActorNote {
  _id: string;
  text: string;
  createdAt: string;
  adminId: { email: string; role: AdminRole } | string;
}

export interface AdminBlock {
  id: string;
  targetType: "anonymous_id" | "network_hash";
  targetRef: string;
  mode: "temporary" | "permanent";
  reason: string;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface AuditEntry {
  _id: string;
  action: string;
  adminId?: { email: string; role: AdminRole };
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
}

export interface AdminSettings {
  freezeIncidentPosting: boolean;
  freezeComments: boolean;
  updatedAt?: string;
}

let csrfToken = "";

function query(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.method && init.method !== "GET" && csrfToken) headers.set("X-CSRF-Token", csrfToken);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Admin API-এর সঙ্গে সংযোগ করা যাচ্ছে না।", 0);
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const envelope = data as {
      error?: {
        code?: string;
        message?: string;
        fieldErrors?: Record<string, string>;
        details?: Record<string, unknown>;
      };
    } | null;
    throw new ApiError(
      envelope?.error?.code ?? "HTTP_ERROR",
      envelope?.error?.message ?? "অনুরোধটি সম্পন্ন করা যায়নি।",
      response.status,
      envelope?.error?.fieldErrors,
      envelope?.error?.details,
    );
  }
  return data as T;
}

export const adminApi = {
  enrolStart: (input: { token: string; password: string }) =>
    request<{ otpauthUri: string }>("/api/admin/enrol/start", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  enrolVerify: (totpCode: string) =>
    request<void>("/api/admin/enrol/verify", {
      method: "POST",
      body: JSON.stringify({ totpCode }),
    }),
  async login(input: { email: string; password: string; totpCode: string }) {
    const result = await request<AdminSession>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    csrfToken = result.csrfToken;
    return result;
  },
  async session() {
    const result = await request<AdminSession>("/api/admin/session");
    csrfToken = result.csrfToken;
    return result;
  },
  async logout() {
    await request<void>("/api/admin/session", { method: "DELETE" });
    csrfToken = "";
  },
  dashboard: () =>
    request<{
      totals: { incidents: number; comments: number; votes: number; openFlags: number };
      today: { incidents: number; comments: number; votes: number; flags: number };
      waitingForReview: {
        incidentFlags: number;
        commentFlags: number;
        hiddenIncidents: number;
        hiddenComments: number;
      };
    }>("/api/admin/dashboard"),
  incidents: (params: Record<string, string | number | undefined>) =>
    request<{ items: AdminIncident[]; pagination: Pagination }>(
      `/api/admin/incidents${query(params)}`,
    ),
  incident: (trackingId: string) =>
    request<{ incident: AdminIncident }>(`/api/admin/incidents/${encodeURIComponent(trackingId)}`),
  moderateIncident: (trackingId: string, action: string, reason: string) =>
    request(`/api/admin/incidents/${encodeURIComponent(trackingId)}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),
  redactIncident: (
    trackingId: string,
    input: { title?: string; description?: string; safetyTip?: string | null; reason: string },
  ) =>
    request(`/api/admin/incidents/${encodeURIComponent(trackingId)}/redaction`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  createIncident: (input: Record<string, unknown>) =>
    request("/api/admin/incidents", { method: "POST", body: JSON.stringify(input) }),
  purgeIncident: (trackingId: string, reason: string) =>
    request<void>(`/api/admin/incidents/${encodeURIComponent(trackingId)}/permanent`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    }),
  comments: (params: Record<string, string | number | undefined>) =>
    request<{ items: AdminComment[]; pagination: Pagination }>(
      `/api/admin/comments${query(params)}`,
    ),
  moderateComment: (id: string, action: string, reason: string) =>
    request(`/api/admin/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),
  purgeComment: (id: string, reason: string) =>
    request<void>(`/api/admin/comments/${id}/permanent`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    }),
  flags: (params: Record<string, string | number | undefined>) =>
    request<{ items: AdminFlag[]; pagination: Pagination }>(`/api/admin/flags${query(params)}`),
  reviewFlag: (id: string, outcome: string, note: string, reason: string) =>
    request(`/api/admin/flags/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ outcome, note, reason }),
    }),
  activity: (value: { trackingId?: string; anonymousId?: string }, reason: string) =>
    request<AdminActivity>(`/api/admin/activity${query(value)}`, {
      headers: { "X-Activity-Reason": reason },
    }),
  actorNotes: (anonymousId: string) =>
    request<{ items: ActorNote[] }>(`/api/admin/actors/${encodeURIComponent(anonymousId)}/notes`),
  addActorNote: (anonymousId: string, text: string, reason: string) =>
    request(`/api/admin/actors/${encodeURIComponent(anonymousId)}/notes`, {
      method: "POST",
      body: JSON.stringify({ text, reason }),
    }),
  blocks: () => request<{ items: AdminBlock[] }>("/api/admin/blocks"),
  createBlock: (input: Record<string, unknown>) =>
    request("/api/admin/blocks", { method: "POST", body: JSON.stringify(input) }),
  removeBlock: (id: string, reason: string) =>
    request<void>(`/api/admin/blocks/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    }),
  users: () => request<{ items: AdminUser[] }>("/api/admin/users"),
  createUser: (input: { email: string; role: AdminRole; reason: string }) =>
    request<{ item: AdminUser; enrollmentToken: string; enrollmentExpiresAt: string }>(
      "/api/admin/users",
      { method: "POST", body: JSON.stringify(input) },
    ),
  updateUser: (id: string, input: { role?: AdminRole; active?: boolean; reason: string }) =>
    request(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  reset2fa: (id: string, reason: string) =>
    request<{ item: AdminUser; enrollmentToken: string; enrollmentExpiresAt: string }>(
      `/api/admin/users/${id}/reset-2fa`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  audit: (params: Record<string, string | number | undefined>) =>
    request<{ items: AuditEntry[]; pagination: Pagination }>(`/api/admin/audit${query(params)}`),
  settings: () => request<AdminSettings>("/api/admin/settings"),
  updateSettings: (input: Partial<AdminSettings> & { reason: string }) =>
    request<AdminSettings>("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};
