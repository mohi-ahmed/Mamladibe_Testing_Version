type TrackingHandoff = { trackingId: string; secret: string; expiresAt: number };

let handoff: TrackingHandoff | null = null;

export function prepareTrackingHandoff(trackingId: string, secret: string, createdAt: number) {
  handoff = { trackingId, secret, expiresAt: createdAt + 15 * 60_000 };
}

export function trackingHandoffStatus(trackingId: string, now = Date.now()) {
  if (!handoff || handoff.trackingId.toUpperCase() !== trackingId.toUpperCase()) return null;
  return { expiresAt: handoff.expiresAt, expired: now >= handoff.expiresAt };
}

export function consumeTrackingHandoff() {
  const value = handoff;
  handoff = null;
  return value && value.expiresAt > Date.now() ? value : null;
}
