import { describe, expect, it } from "vitest";

import { AppError } from "../src/lib/app-error.js";
import { parseInput } from "../src/validation/parse.js";
import { settingsPatchSchema } from "../src/validation/admin.schemas.js";
import { createIncidentSchema, listIncidentsQuerySchema } from "../src/validation/schemas.js";

const validIncident = {
  title: "Large pothole",
  description: "The pothole blocks most of the left traffic lane.",
  category: "road",
  incidentAt: "2026-11-11T10:00:00.000Z",
  lat: 23.78,
  lng: 90.4,
  roadName: "Airport Road",
  areaName: "Banani",
  captchaToken: "token",
};

describe("strict contract validation", () => {
  it("requires a reason and at least one platform setting change", () => {
    expect(() => parseInput(settingsPatchSchema, { reason: "Emergency response" })).toThrow(
      AppError,
    );
    expect(
      parseInput(settingsPatchSchema, {
        freezeIncidentPosting: true,
        reason: "Emergency moderation response",
      }),
    ).toMatchObject({ freezeIncidentPosting: true });
  });
  it("rejects unknown JSON properties", () => {
    expect(() => parseInput(createIncidentSchema, { ...validIncident, unexpected: true })).toThrow(
      AppError,
    );
  });

  it("coerces valid page queries", () => {
    expect(parseInput(listIncidentsQuerySchema, { page: "2", pageSize: "20" })).toMatchObject({
      page: 2,
      pageSize: 20,
    });
  });

  it("requires all viewport coordinates together", () => {
    expect(() => parseInput(listIncidentsQuerySchema, { minLat: "23" })).toThrow(AppError);
  });
});
