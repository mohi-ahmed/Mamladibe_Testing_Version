type TrackingHandoff = { trackingId: string; secret: string; expiresAt: number };

let handoff: TrackingHandoff | null = null;

export function prepareTrackingHandoff(trackingId: string, secret: string) {
  handoff = { trackingId, secret, expiresAt: Date.now() + 15 * 60_000 };
}

export function consumeTrackingHandoff() {
  const value = handoff;
  handoff = null;
  return value && value.expiresAt > Date.now() ? value : null;
}
