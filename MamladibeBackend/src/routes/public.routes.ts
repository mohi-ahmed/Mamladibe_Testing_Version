import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config/env.js";
import type { createPublicController } from "../controllers/public.controller.js";
import { AppError } from "../lib/app-error.js";
import { networkHash, requireAllowedOrigin, requirePublicActor } from "../middleware/identity.js";
import { PlatformSettingsModel } from "../models/admin.js";
import {
  enforceRateLimit,
  type RateLimitAction,
  type RateLimitStore,
} from "../services/rate-limit.service.js";

type Controller = ReturnType<typeof createPublicController>;

export function registerPublicRoutes(
  app: FastifyInstance,
  config: AppConfig,
  controller: Controller,
  rateLimit: RateLimitStore,
) {
  const publicWrite =
    (
      action?: RateLimitAction,
      feature?: "incidents" | "comments",
      networkSubject?: (request: FastifyRequest) => string,
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireAllowedOrigin(request, config);
      if (feature) {
        const settings = await PlatformSettingsModel.findById("platform").lean();
        const paused =
          feature === "incidents" ? settings?.freezeIncidentPosting : settings?.freezeComments;
        if (paused)
          throw new AppError(
            "SERVICE_UNAVAILABLE",
            feature === "incidents"
              ? "Incident posting is temporarily paused."
              : "Comments are temporarily paused.",
            { details: { feature } },
          );
      }
      await requirePublicActor(request, reply, config);
      if (action) {
        await enforceRateLimit(rateLimit, action, request.actor!.id, "actor");
        const network = networkHash(request, config);
        await enforceRateLimit(
          rateLimit,
          action,
          networkSubject ? `${network}:${networkSubject(request)}` : network,
          "network",
        );
      }
    };

  const networkLimited = (action: RateLimitAction) => async (request: FastifyRequest) => {
    await enforceRateLimit(rateLimit, action, networkHash(request, config), "network");
  };

  app.get("/api/health", controller.health);
  app.post("/api/identity", { preHandler: publicWrite() }, controller.establishIdentity);
  app.get("/api/feed", controller.feed);
  app.get("/api/incidents", controller.listIncidents);
  app.get("/api/incidents/:trackingId", controller.getIncident);
  app.post(
    "/api/incidents",
    { preHandler: publicWrite("incident", "incidents") },
    controller.createIncident,
  );

  app.post(
    "/api/incidents/:trackingId/vote",
    {
      preHandler: publicWrite("vote", undefined, (request) => trackingIdFromRequest(request)),
    },
    controller.setVote,
  );
  app.delete(
    "/api/incidents/:trackingId/vote",
    {
      preHandler: publicWrite("vote", undefined, (request) => trackingIdFromRequest(request)),
    },
    controller.removeVote,
  );
  app.post(
    "/api/incidents/:trackingId/report",
    { preHandler: publicWrite("flag") },
    controller.reportIncident,
  );

  app.get("/api/incidents/:trackingId/comments", controller.listComments);
  app.post(
    "/api/incidents/:trackingId/comments",
    { preHandler: publicWrite(undefined, "comments") },
    controller.createComment,
  );
  app.delete("/api/comments/:commentId", { preHandler: publicWrite() }, controller.removeComment);
  app.post(
    "/api/comments/:commentId/report",
    { preHandler: publicWrite("flag") },
    controller.reportComment,
  );

  app.post("/api/track", { preHandler: networkLimited("track") }, controller.track);
  app.patch(
    "/api/incidents/:trackingId/edit",
    { preHandler: publicWrite("track") },
    controller.editIncident,
  );
  app.get("/api/geo/reverse", controller.reverseGeocode);
}

function trackingIdFromRequest(request: FastifyRequest) {
  const value = (request.params as { trackingId?: string }).trackingId ?? "unknown";
  return value.toUpperCase();
}
