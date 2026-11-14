import { describe, expect, it } from "vitest";

import {
  consumeTrackingHandoff,
  prepareTrackingHandoff,
  trackingHandoffStatus,
} from "@/lib/tracking-handoff";

describe("reporter edit handoff", () => {
  it("is visible only for the matching report and consumes the secret once", () => {
    const createdAt = Date.now();
    prepareTrackingHandoff("MD-OWNER", "private-secret", createdAt);

    expect(trackingHandoffStatus("MD-OTHER", createdAt)).toBeNull();
    expect(trackingHandoffStatus("md-owner", createdAt)).toEqual({
      expiresAt: createdAt + 15 * 60_000,
      expired: false,
    });
    expect(consumeTrackingHandoff()).toMatchObject({
      trackingId: "MD-OWNER",
      secret: "private-secret",
    });
    expect(consumeTrackingHandoff()).toBeNull();
  });

  it("keeps an expired status for the disabled UI but refuses the secret", () => {
    const createdAt = Date.now() - 16 * 60_000;
    prepareTrackingHandoff("MD-EXPIRED", "private-secret", createdAt);

    expect(trackingHandoffStatus("MD-EXPIRED")).toMatchObject({ expired: true });
    expect(consumeTrackingHandoff()).toBeNull();
  });
});
