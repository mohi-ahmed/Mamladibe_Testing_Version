import { z } from "zod";
import { CATEGORIES, COMMENT_TYPES } from "../lib/constants.js";

const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const reason = z.string().trim().min(5).max(500);
export const pagination = strict({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

export const loginSchema = strict({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
  totpCode: z.string().regex(/^\d{6}$/),
});
export const enrolStartSchema = strict({
  token: z.string().min(32),
  password: z.string().min(12).max(128),
});
export const enrolVerifySchema = strict({ totpCode: z.string().regex(/^\d{6}$/) });
export const reasonSchema = strict({ reason });
export const settingsPatchSchema = strict({
  freezeIncidentPosting: z.boolean().optional(),
  freezeComments: z.boolean().optional(),
  reason,
}).refine(
  (value) => value.freezeIncidentPosting !== undefined || value.freezeComments !== undefined,
  { message: "No setting update provided." },
);
export const moderationSchema = strict({
  action: z.enum(["hide", "unhide", "soft_delete", "restore"]),
  reason,
});
export const redactionSchema = strict({
  title: z.string().trim().min(5).max(100).optional(),
  description: z.string().trim().min(20).max(2_000).optional(),
  safetyTip: z.string().trim().max(500).nullable().optional(),
  reason,
}).refine(
  (value) =>
    value.title !== undefined || value.description !== undefined || value.safetyTip !== undefined,
  {
    message: "At least one content field is required.",
  },
);
export const adminCreateSchema = strict({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["moderator", "super_admin"]),
  reason,
});
export const adminPatchSchema = strict({
  role: z.enum(["moderator", "super_admin"]).optional(),
  active: z.boolean().optional(),
  reason,
}).refine((value) => value.role !== undefined || value.active !== undefined, {
  message: "No update provided.",
});
export const blockCreateSchema = strict({
  targetType: z.enum(["anonymous_id", "network_hash"]),
  targetRef: z.string().trim().min(8).max(256),
  mode: z.enum(["temporary", "permanent"]),
  expiresAt: z.string().datetime().optional(),
  reason,
}).superRefine((value, ctx) => {
  if (value.mode === "temporary" && !value.expiresAt)
    ctx.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Required for temporary blocks.",
    });
  if (value.mode === "permanent" && value.expiresAt)
    ctx.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Forbidden for permanent blocks.",
    });
});
export const flagReviewSchema = strict({
  outcome: z.enum(["kept", "hidden", "removed"]),
  note: z.string().trim().max(1_000).optional(),
  reason,
});
export const noteSchema = strict({ text: z.string().trim().min(1).max(1_000), reason });
export const bulkSchema = strict({
  targetType: z.enum(["vote", "comment", "flag"]),
  targetIds: z.array(objectId).min(1).max(100),
  action: z.enum(["remove", "hide", "soft_delete", "invalidate"]),
  reason,
});
export const adminIncidentCreateSchema = strict({
  title: z.string().trim().min(5).max(100),
  description: z.string().trim().min(20).max(2_000),
  category: z.enum(CATEGORIES),
  incidentAt: z.string().datetime({ offset: true }),
  lat: z.number().finite(),
  lng: z.number().finite(),
  roadName: z.string().trim().max(200),
  areaName: z.string().trim().min(1).max(200),
  safetyTip: z.string().trim().max(500).optional(),
  adminLabel: z.enum(["official", "test"]),
  reason,
});
const dateQuery = z.string().datetime({ offset: true }).optional();
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const incidentListQuerySchema = strict({
  q: z.string().trim().max(100).optional(),
  trackingId: z.string().trim().max(20).optional(),
  anonymousId: z.string().trim().max(100).optional(),
  status: z.enum(["published", "hidden", "deleted"]).optional(),
  category: z.enum(CATEGORIES).optional(),
  source: z.enum(["public", "admin"]).optional(),
  flagged: z.enum(["true", "false"]).optional(),
  from: dateQuery,
  to: dateQuery,
  sort: z.enum(["newest", "oldest"]).default("newest"),
  ...pageQuery,
});
export const commentListQuerySchema = strict({
  q: z.string().trim().max(100).optional(),
  incidentTrackingId: z.string().trim().max(20).optional(),
  anonymousId: z.string().trim().max(100).optional(),
  type: z.enum(COMMENT_TYPES).optional(),
  status: z.enum(["published", "hidden", "deleted"]).optional(),
  flagged: z.enum(["true", "false"]).optional(),
  from: dateQuery,
  to: dateQuery,
  sort: z.enum(["newest", "oldest"]).default("newest"),
  ...pageQuery,
});
export const flagListQuerySchema = strict({
  reviewStatus: z.enum(["pending", "reviewed"]).optional(),
  targetType: z.enum(["incident", "comment"]).optional(),
  reason: z.string().trim().max(100).optional(),
  trackingId: z.string().trim().max(20).optional(),
  from: dateQuery,
  to: dateQuery,
  ...pageQuery,
});
export const auditListQuerySchema = strict({
  adminId: objectId.optional(),
  action: z.string().trim().max(100).optional(),
  targetType: z.enum(["incident", "comment", "flag", "vote", "actor", "block", "admin"]).optional(),
  targetId: z.string().trim().max(100).optional(),
  from: dateQuery,
  to: dateQuery,
  sort: z.enum(["newest", "oldest"]).default("newest"),
  ...pageQuery,
});
export const activityQuerySchema = strict({
  trackingId: z.string().trim().optional(),
  anonymousId: z.string().trim().optional(),
}).refine((value) => Boolean(value.trackingId) !== Boolean(value.anonymousId), {
  message: "Provide exactly one lookup key.",
});
