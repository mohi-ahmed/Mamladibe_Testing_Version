import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type IncidentListParams, type VoteResult } from "./api";
import type { Incident } from "./incidents";

export const incidentKeys = {
  all: ["incidents"] as const,
  list: (params: IncidentListParams) => ["incidents", "list", params] as const,
  detail: (trackingId: string) => ["incidents", "detail", trackingId.toUpperCase()] as const,
  comments: (trackingId: string) => ["incidents", "comments", trackingId.toUpperCase()] as const,
  feed: ["incidents", "feed"] as const,
};

/** Lightweight cached feed used only by the homepage. */
export function useHomepageFeed() {
  return useQuery({
    queryKey: incidentKeys.feed,
    queryFn: () => api.homepageFeed(),
    staleTime: 15_000,
  });
}

export function useIncidentList(params: IncidentListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: incidentKeys.list(params),
    queryFn: () => api.listIncidents(params),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useIncident(id: string) {
  const trackingId = id.toUpperCase();
  const result = useQuery({
    queryKey: incidentKeys.detail(trackingId),
    queryFn: () => api.getIncident(trackingId),
    enabled: Boolean(id),
  });
  return result.data;
}

export function useIncidentQuery(id: string) {
  const trackingId = id.toUpperCase();
  return useQuery({
    queryKey: incidentKeys.detail(trackingId),
    queryFn: () => api.getIncident(trackingId),
    enabled: Boolean(id),
  });
}

export function useMyVote(id: string) {
  return useIncident(id)?.viewerState.vote ?? undefined;
}

export function useComments(id: string) {
  const trackingId = id.toUpperCase();
  const result = useQuery({
    queryKey: incidentKeys.comments(trackingId),
    queryFn: () => api.listComments(trackingId),
    enabled: Boolean(id),
  });
  return result.data?.items ?? [];
}

export function useRefreshIncident() {
  const client = useQueryClient();
  return async (trackingId: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: incidentKeys.all }),
      client.invalidateQueries({ queryKey: incidentKeys.detail(trackingId) }),
      client.invalidateQueries({ queryKey: incidentKeys.comments(trackingId) }),
    ]);
  };
}

export async function castVote(incident: Incident, vote: "support" | "dispute") {
  if (incident.viewerState.vote === vote) return api.removeVote(incident.trackingId);
  return api.setVote(incident.trackingId, vote);
}

function patchIncident(incident: Incident, trackingId: string, result: VoteResult) {
  if (incident.trackingId !== trackingId) return incident;
  return {
    ...incident,
    support: result.counts.support,
    dispute: result.counts.dispute,
    flags: result.counts.flags,
    commentCount: result.counts.comments,
    viewerState: { ...incident.viewerState, vote: result.vote },
  };
}

export function applyVoteResult(data: unknown, trackingId: string, result: VoteResult): unknown {
  if (!data || typeof data !== "object") return data;
  if ("trackingId" in data) return patchIncident(data as Incident, trackingId, result);
  if ("items" in data && Array.isArray((data as { items: unknown }).items)) {
    const container = data as { items: Incident[] };
    return {
      ...container,
      items: container.items.map((item) => patchIncident(item, trackingId, result)),
    };
  }
  return data;
}

export const flagIncident = (trackingId: string, reason: string) =>
  api.reportIncident(trackingId, reason);

export const addComment = (
  trackingId: string,
  comment: { type: "correction" | "extra" | "opinion"; text: string; captchaToken: string },
) => api.createComment(trackingId, comment);

export const deleteComment = (commentId: string) => api.deleteComment(commentId);
export const flagComment = (commentId: string, reason: string) =>
  api.reportComment(commentId, reason);
