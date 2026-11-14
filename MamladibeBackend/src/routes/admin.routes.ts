import mongoose from "mongoose";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { createAdminGuards } from "../middleware/admin-auth.js";
import { networkHash, requireAllowedOrigin } from "../middleware/identity.js";
import { AdminSessionModel, PlatformSettingsModel } from "../models/admin.js";
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_ENROL_COOKIE,
  ADMIN_SESSION_COOKIE,
  AdminAuthService,
} from "../services/admin-auth.service.js";
import { AdminModerationService } from "../services/admin-moderation.service.js";
import { writeAudit } from "../services/audit.service.js";
import { enforceRateLimit, type RateLimitStore } from "../services/rate-limit.service.js";
import type { FeedCache } from "../services/feed-cache.service.js";
import {
  activityQuerySchema,
  adminCreateSchema,
  adminIncidentCreateSchema,
  adminPatchSchema,
  auditListQuerySchema,
  blockCreateSchema,
  bulkSchema,
  commentListQuerySchema,
  enrolStartSchema,
  enrolVerifySchema,
  flagListQuerySchema,
  flagReviewSchema,
  incidentListQuerySchema,
  loginSchema,
  moderationSchema,
  noteSchema,
  objectId,
  reasonSchema,
  redactionSchema,
  settingsPatchSchema,
} from "../validation/admin.schemas.js";
import { parseInput } from "../validation/parse.js";

const params = (request: FastifyRequest) => request.params as Record<string, string>;
const adminContext = (request: FastifyRequest) => ({
  id: request.admin!.id,
  role: request.admin!.role,
});
function setSessionCookies(
  reply: FastifyReply,
  config: AppConfig,
  sessionToken: string,
  csrfToken: string,
) {
  const options = {
    secure: config.isProduction,
    sameSite: "strict" as const,
    path: "/api/admin",
    maxAge: config.ADMIN_SESSION_ABSOLUTE_SECONDS,
  };
  reply.setCookie(ADMIN_SESSION_COOKIE, sessionToken, { ...options, httpOnly: true });
  reply.setCookie(ADMIN_CSRF_COOKIE, csrfToken, { ...options, httpOnly: false });
}
function clearSessionCookies(reply: FastifyReply, config: AppConfig) {
  const options = { secure: config.isProduction, sameSite: "strict" as const, path: "/api/admin" };
  reply.clearCookie(ADMIN_SESSION_COOKIE, { ...options, httpOnly: true });
  reply.clearCookie(ADMIN_CSRF_COOKIE, options);
}

export function registerAdminRoutes(
  app: FastifyInstance,
  config: AppConfig,
  rateLimit: RateLimitStore,
  feedCache?: FeedCache,
) {
  const auth = new AdminAuthService(config);
  const service = new AdminModerationService(feedCache);
  const guards = createAdminGuards(config);
  const both = ["moderator", "super_admin"] as const;
  const superOnly = ["super_admin"] as const;

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/admin")) {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
      reply.header("X-Robots-Tag", "noindex, nofollow");
    }
    return payload;
  });

  app.post(
    "/api/admin/login",
    {
      preHandler: async (request) => {
        requireAllowedOrigin(request, config);
        await enforceRateLimit(rateLimit, "admin_login", networkHash(request, config), "network");
      },
    },
    async (request, reply) => {
      const result = await auth.login(parseInput(loginSchema, request.body));
      setSessionCookies(reply, config, result.sessionToken, result.csrfToken);
      return {
        admin: { id: result.admin.id, email: result.admin.email, role: result.admin.role },
        csrfToken: result.csrfToken,
        session: {
          absoluteExpiresAt: result.absoluteExpiresAt.toISOString(),
          idleExpiresAt: new Date(
            Date.now() + config.ADMIN_SESSION_IDLE_SECONDS * 1_000,
          ).toISOString(),
        },
      };
    },
  );
  app.get("/api/admin/session", { preHandler: guards.authenticate }, async (request) => ({
    admin: { id: request.admin!.id, email: request.admin!.email, role: request.admin!.role },
    csrfToken: request.cookies[ADMIN_CSRF_COOKIE],
    session: {
      absoluteExpiresAt: request.admin!.absoluteExpiresAt.toISOString(),
      idleExpiresAt: request.admin!.idleExpiresAt.toISOString(),
    },
  }));
  app.delete("/api/admin/session", { preHandler: guards.mutation }, async (request, reply) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await AdminSessionModel.deleteOne({ _id: request.admin!.sessionId }).session(session);
        await writeAudit(
          {
            adminId: request.admin!.id,
            action: "auth.logout",
            targetType: "admin",
            targetId: request.admin!.id,
            reason: "Administrator signed out",
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    clearSessionCookies(reply, config);
    return reply.code(204).send();
  });
  app.post(
    "/api/admin/enrol/start",
    { preHandler: (request) => requireAllowedOrigin(request, config) },
    async (request, reply) => {
      const result = await auth.startEnrollment(parseInput(enrolStartSchema, request.body));
      reply.setCookie(ADMIN_ENROL_COOKIE, result.cookieToken, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "strict",
        path: "/api/admin/enrol",
        maxAge: 900,
      });
      return { otpauthUri: result.otpauthUri };
    },
  );
  app.post(
    "/api/admin/enrol/verify",
    { preHandler: (request) => requireAllowedOrigin(request, config) },
    async (request, reply) => {
      const input = parseInput(enrolVerifySchema, request.body);
      await auth.verifyEnrollment(request.cookies[ADMIN_ENROL_COOKIE], input.totpCode);
      reply.clearCookie(ADMIN_ENROL_COOKIE, { path: "/api/admin/enrol" });
      return reply.code(204).send();
    },
  );

  app.get("/api/admin/dashboard", { preHandler: guards.roles(both) }, () => service.dashboard());
  app.get("/api/admin/incidents", { preHandler: guards.roles(both) }, (r) =>
    service.listIncidents(parseInput(incidentListQuerySchema, r.query)),
  );
  app.get("/api/admin/incidents/:trackingId", { preHandler: guards.roles(both) }, (r) =>
    service.getIncident(params(r).trackingId!),
  );
  app.post("/api/admin/incidents", { preHandler: guards.roles(both, true) }, (r, reply) =>
    service
      .createIncident(parseInput(adminIncidentCreateSchema, r.body), adminContext(r))
      .then((value) => reply.code(201).send(value)),
  );
  app.patch("/api/admin/incidents/:trackingId", { preHandler: guards.roles(both, true) }, (r) =>
    service.moderateIncident(
      params(r).trackingId!,
      parseInput(moderationSchema, r.body),
      adminContext(r),
    ),
  );
  app.patch(
    "/api/admin/incidents/:trackingId/redaction",
    { preHandler: guards.roles(both, true) },
    (r) =>
      service.redactIncident(
        params(r).trackingId!,
        parseInput(redactionSchema, r.body),
        adminContext(r),
      ),
  );
  app.delete(
    "/api/admin/incidents/:trackingId/permanent",
    { preHandler: guards.roles(superOnly, true) },
    async (r, reply) => {
      await service.purgeIncident(
        params(r).trackingId!,
        parseInput(reasonSchema, r.body).reason,
        adminContext(r),
      );
      return reply.code(204).send();
    },
  );

  app.get("/api/admin/comments", { preHandler: guards.roles(both) }, (r) =>
    service.listComments(parseInput(commentListQuerySchema, r.query)),
  );
  app.get("/api/admin/comments/:commentId", { preHandler: guards.roles(both) }, (r) =>
    service.getComment(parseInput(objectId, params(r).commentId)),
  );
  app.patch("/api/admin/comments/:commentId", { preHandler: guards.roles(both, true) }, (r) =>
    service.moderateComment(
      parseInput(objectId, params(r).commentId),
      parseInput(moderationSchema, r.body),
      adminContext(r),
    ),
  );
  app.delete(
    "/api/admin/comments/:commentId/permanent",
    { preHandler: guards.roles(superOnly, true) },
    async (r, reply) => {
      await service.purgeComment(
        parseInput(objectId, params(r).commentId),
        parseInput(reasonSchema, r.body).reason,
        adminContext(r),
      );
      return reply.code(204).send();
    },
  );

  app.get("/api/admin/flags", { preHandler: guards.roles(both) }, (r) =>
    service.listFlags(parseInput(flagListQuerySchema, r.query)),
  );
  app.get("/api/admin/flags/:flagId", { preHandler: guards.roles(both) }, (r) =>
    service.getFlag(parseInput(objectId, params(r).flagId)),
  );
  app.patch("/api/admin/flags/:flagId", { preHandler: guards.roles(both, true) }, (r) =>
    service.reviewFlag(
      parseInput(objectId, params(r).flagId),
      parseInput(flagReviewSchema, r.body),
      adminContext(r),
    ),
  );

  app.get("/api/admin/activity", { preHandler: guards.roles(both) }, (r) => {
    const value = r.headers["x-activity-reason"];
    const reason = Array.isArray(value) ? value[0] : value;
    if (
      !reason ||
      !["moderation_review", "abuse_investigation", "support_request"].includes(reason)
    )
      throw new AppError("VALIDATION_ERROR", "A valid X-Activity-Reason header is required.");
    return service.activity(parseInput(activityQuerySchema, r.query), reason, adminContext(r));
  });
  app.get("/api/admin/actors/:anonymousId/notes", { preHandler: guards.roles(both) }, (r) =>
    service.actorNotes(params(r).anonymousId!),
  );
  app.post("/api/admin/actors/:anonymousId/notes", { preHandler: guards.roles(both, true) }, (r) =>
    service.addActorNote(params(r).anonymousId!, parseInput(noteSchema, r.body), adminContext(r)),
  );
  app.post("/api/admin/bulk-actions", { preHandler: guards.roles(both, true) }, (r) =>
    service.bulk(parseInput(bulkSchema, r.body), adminContext(r)),
  );

  app.get("/api/admin/blocks", { preHandler: guards.roles(superOnly) }, () => service.listBlocks());
  app.post("/api/admin/blocks", { preHandler: guards.roles(superOnly, true) }, (r, reply) =>
    service
      .createBlock(parseInput(blockCreateSchema, r.body), adminContext(r))
      .then((value) => reply.code(201).send(value)),
  );
  app.delete(
    "/api/admin/blocks/:blockId",
    { preHandler: guards.roles(superOnly, true) },
    async (r, reply) => {
      await service.removeBlock(
        parseInput(objectId, params(r).blockId),
        parseInput(reasonSchema, r.body).reason,
        adminContext(r),
      );
      return reply.code(204).send();
    },
  );

  app.get("/api/admin/users", { preHandler: guards.roles(superOnly) }, () => service.listAdmins());
  app.get("/api/admin/users/:adminId", { preHandler: guards.roles(superOnly) }, (r) =>
    service.getAdmin(parseInput(objectId, params(r).adminId)),
  );
  app.post("/api/admin/users", { preHandler: guards.roles(superOnly, true) }, (r, reply) =>
    service
      .createAdmin(parseInput(adminCreateSchema, r.body), adminContext(r))
      .then((value) => reply.code(201).send(value)),
  );
  app.patch("/api/admin/users/:adminId", { preHandler: guards.roles(superOnly, true) }, (r) =>
    service.updateAdmin(
      parseInput(objectId, params(r).adminId),
      parseInput(adminPatchSchema, r.body),
      adminContext(r),
    ),
  );
  app.post(
    "/api/admin/users/:adminId/reset-2fa",
    { preHandler: guards.roles(superOnly, true) },
    (r) =>
      service.reset2fa(
        parseInput(objectId, params(r).adminId),
        parseInput(reasonSchema, r.body).reason,
        adminContext(r),
      ),
  );
  app.get("/api/admin/audit", { preHandler: guards.roles(both) }, (r) =>
    service.audit(parseInput(auditListQuerySchema, r.query), adminContext(r)),
  );
  app.get("/api/admin/settings", { preHandler: guards.roles(superOnly) }, async () => {
    const item = await PlatformSettingsModel.findById("platform").lean();
    return {
      freezeIncidentPosting: item?.freezeIncidentPosting ?? false,
      freezeComments: item?.freezeComments ?? false,
      updatedAt: item?.updatedAt,
    };
  });
  app.patch(
    "/api/admin/settings",
    { preHandler: guards.roles(superOnly, true) },
    async (request) => {
      const input = parseInput(settingsPatchSchema, request.body);
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const before = await PlatformSettingsModel.findById("platform").session(session).lean();
          const updated = await PlatformSettingsModel.findByIdAndUpdate(
            "platform",
            {
              $set: {
                ...(input.freezeIncidentPosting !== undefined
                  ? { freezeIncidentPosting: input.freezeIncidentPosting }
                  : {}),
                ...(input.freezeComments !== undefined
                  ? { freezeComments: input.freezeComments }
                  : {}),
                updatedBy: request.admin!.id,
              },
              $setOnInsert: { _id: "platform" },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, session },
          ).lean();
          await writeAudit(
            {
              adminId: request.admin!.id,
              action: "settings.update",
              targetType: "settings",
              targetId: "platform",
              reason: input.reason,
              before,
              after: updated,
            },
            session,
          );
        });
      } finally {
        await session.endSession();
      }
      const result = await PlatformSettingsModel.findById("platform").lean();
      return {
        freezeIncidentPosting: result?.freezeIncidentPosting ?? false,
        freezeComments: result?.freezeComments ?? false,
        updatedAt: result?.updatedAt,
      };
    },
  );
}
