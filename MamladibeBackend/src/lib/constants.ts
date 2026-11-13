export const CATEGORIES = ["accident", "violation", "police", "road", "safety", "other"] as const;
export const VOTE_TYPES = ["support", "dispute"] as const;
export const COMMENT_TYPES = ["correction", "extra", "opinion"] as const;
export const INCIDENT_FLAG_REASONS = [
  "spam",
  "fake",
  "misleading",
  "inappropriate",
  "irrelevant",
] as const;
export const COMMENT_FLAG_REASONS = ["spam", "abusive", "private", "irrelevant"] as const;
export const CONTENT_STATUSES = ["published", "hidden", "deleted"] as const;

export const RULES = {
  titleMin: 5,
  titleMax: 100,
  descriptionMin: 20,
  descriptionMax: 2_000,
  safetyTipMax: 500,
  commentMin: 5,
  commentMax: 500,
  commentsPerWindow: 5,
  commentWindowMs: 24 * 60 * 60 * 1_000,
  quickEditMs: 15 * 60 * 1_000,
  maxEditChangeRatio: 0.2,
  incidentPageSize: 20,
  maxIncidentPageSize: 100,
  commentPageSize: 10,
} as const;

export const BANGLADESH_BOUNDS = {
  minLat: 20.55,
  maxLat: 26.65,
  minLng: 88,
  maxLng: 92.7,
} as const;

export function isInBangladesh(lat: number, lng: number) {
  return (
    lat >= BANGLADESH_BOUNDS.minLat &&
    lat <= BANGLADESH_BOUNDS.maxLat &&
    lng >= BANGLADESH_BOUNDS.minLng &&
    lng <= BANGLADESH_BOUNDS.maxLng
  );
}
