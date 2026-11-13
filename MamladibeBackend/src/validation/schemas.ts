import { z } from "zod";

import {
  CATEGORIES,
  COMMENT_FLAG_REASONS,
  COMMENT_TYPES,
  INCIDENT_FLAG_REASONS,
  RULES,
  VOTE_TYPES,
} from "../lib/constants.js";

const plainText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

export const trackingIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^MD-[A-Z2-9]{6}$/, "Invalid Tracking ID format");

export const commentIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid comment ID");

export const createIncidentSchema = z
  .object({
    title: plainText(RULES.titleMin, RULES.titleMax),
    description: plainText(RULES.descriptionMin, RULES.descriptionMax),
    category: z.enum(CATEGORIES),
    incidentAt: z.string().datetime({ offset: true }),
    lat: z.number().finite(),
    lng: z.number().finite(),
    roadName: z.string().trim().max(200),
    areaName: z.string().trim().min(1).max(200),
    safetyTip: z.string().trim().max(RULES.safetyTipMax).optional(),
    captchaToken: z.string().trim().min(1),
  })
  .strict();

const optionalNumberFromQuery = z
  .string()
  .optional()
  .transform((value) => (value === undefined ? undefined : Number(value)))
  .refine((value) => value === undefined || Number.isFinite(value), "Must be a number");

const optionalPositiveInteger = (maximum?: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : Number(value)))
    .refine(
      (value) =>
        value === undefined ||
        (Number.isInteger(value) && value > 0 && (maximum === undefined || value <= maximum)),
      maximum ? `Must be an integer from 1 to ${maximum}` : "Must be a positive integer",
    );

export const listIncidentsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    category: z.enum(CATEGORIES).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    page: optionalPositiveInteger(),
    pageSize: optionalPositiveInteger(RULES.maxIncidentPageSize),
    sort: z.enum(["newest", "oldest"]).optional(),
    minLat: optionalNumberFromQuery,
    minLng: optionalNumberFromQuery,
    maxLat: optionalNumberFromQuery,
    maxLng: optionalNumberFromQuery,
    lat: optionalNumberFromQuery,
    lng: optionalNumberFromQuery,
    radiusKm: optionalNumberFromQuery,
  })
  .strict()
  .superRefine((value, ctx) => {
    const viewport = [value.minLat, value.minLng, value.maxLat, value.maxLng];
    const viewportCount = viewport.filter((item) => item !== undefined).length;
    if (viewportCount !== 0 && viewportCount !== 4) {
      ctx.addIssue({ code: "custom", message: "All four viewport bounds are required" });
    }
    const nearby = [value.lat, value.lng, value.radiusKm];
    const nearbyCount = nearby.filter((item) => item !== undefined).length;
    if (nearbyCount !== 0 && nearbyCount !== 3) {
      ctx.addIssue({ code: "custom", message: "lat, lng and radiusKm are required together" });
    }
    if (value.radiusKm !== undefined && (value.radiusKm <= 0 || value.radiusKm > 100)) {
      ctx.addIssue({ code: "custom", path: ["radiusKm"], message: "Must be between 0 and 100" });
    }
  });

export const voteSchema = z.object({ type: z.enum(VOTE_TYPES) }).strict();
export const incidentReportSchema = z.object({ reason: z.enum(INCIDENT_FLAG_REASONS) }).strict();
export const commentReportSchema = z.object({ reason: z.enum(COMMENT_FLAG_REASONS) }).strict();

export const listCommentsQuerySchema = z
  .object({
    page: optionalPositiveInteger(),
    pageSize: optionalPositiveInteger(RULES.commentPageSize),
  })
  .strict();

export const createCommentSchema = z
  .object({
    type: z.enum(COMMENT_TYPES),
    text: plainText(RULES.commentMin, RULES.commentMax),
    captchaToken: z.string().trim().min(1),
  })
  .strict();

export const trackSchema = z
  .object({ trackingId: trackingIdSchema, secret: z.string().trim().min(1).max(200) })
  .strict();

export const editIncidentSchema = z
  .object({
    secret: z.string().trim().min(1).max(200),
    title: plainText(RULES.titleMin, RULES.titleMax),
    description: plainText(RULES.descriptionMin, RULES.descriptionMax),
    safetyTip: z.string().trim().max(RULES.safetyTipMax).optional(),
  })
  .strict();

export const reverseGeocodeSchema = z
  .object({ lat: optionalNumberFromQuery, lng: optionalNumberFromQuery })
  .strict()
  .refine((value) => value.lat !== undefined && value.lng !== undefined, {
    message: "lat and lng are required",
  });
