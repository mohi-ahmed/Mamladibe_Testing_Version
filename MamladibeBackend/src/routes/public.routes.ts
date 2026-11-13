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

export async function registerPublicRoutes(
  app: FastifyInstance,
  config: AppConfig,
  controller: Controller,
  rateLimit: RateLimitStore,
) {
  const publicWrite =
    (action?: RateLimitAction, feature?: "incidents" | "comments") =>
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
        await enforceRateLimit(rateLimit, action, networkHash(request, config), "network");
      }
    };

  const networkLimited = (action: RateLimitAction) => async (request: FastifyRequest) => {
    await enforceRateLimit(rateLimit, action, networkHash(request, config), "network");
  };

  app.get("/api/health", controller.health);
  app.get("/api/incidents", controller.listIncidents);
  app.get("/api/incidents/:trackingId", controller.getIncident);
  app.post(
    "/api/incidents",
    { preHandler: publicWrite("incident", "incidents") },
    controller.createIncident,
  );

  app.post(
    "/api/incidents/:trackingId/vote",
    { preHandler: publicWrite("vote") },
    controller.setVote,
  );
  app.delete(
    "/api/incidents/:trackingId/vote",
    { preHandler: publicWrite("vote") },
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
