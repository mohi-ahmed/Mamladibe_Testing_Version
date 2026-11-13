import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { databaseIsReady } from "../database/mongoose.js";
import { networkHash, optionalActor } from "../middleware/identity.js";
import type { CommentService } from "../services/comment.service.js";
import type { GeocodeService } from "../services/geocode.service.js";
import type { IncidentService } from "../services/incident.service.js";
import type { CommentQuotaStore } from "../services/quota.service.js";
import type { RateLimitStore } from "../services/rate-limit.service.js";
import type { ReportService } from "../services/report.service.js";
import type { TrackingService } from "../services/tracking.service.js";
import type { VoteService } from "../services/vote.service.js";
import { parseInput } from "../validation/parse.js";
import {
  commentIdSchema,
  commentReportSchema,
  createCommentSchema,
  createIncidentSchema,
  editIncidentSchema,
  incidentReportSchema,
  listCommentsQuerySchema,
  listIncidentsQuerySchema,
  reverseGeocodeSchema,
  trackingIdSchema,
  trackSchema,
  voteSchema,
} from "../validation/schemas.js";

interface Services {
  incidents: IncidentService;
  votes: VoteService;
  reports: ReportService;
  comments: CommentService;
  tracking: TrackingService;
  geocode: GeocodeService;
  quota: CommentQuotaStore;
  rateLimit: RateLimitStore;
}

function trackingIdFrom(request: FastifyRequest) {
  const { trackingId } = request.params as { trackingId?: unknown };
  return parseInput(trackingIdSchema, trackingId);
}

function commentIdFrom(request: FastifyRequest) {
  const { commentId } = request.params as { commentId?: unknown };
  return parseInput(commentIdSchema, commentId);
}

export function createPublicController(config: AppConfig, services: Services) {
  return {
    health: async () => {
      const [quotaReady, rateLimitReady] = await Promise.all([
        services.quota.ping().catch(() => false),
        services.rateLimit.ping().catch(() => false),
      ]);
      const dependenciesReady = databaseIsReady() && quotaReady && rateLimitReady;
      if (!dependenciesReady) {
        throw new AppError("SERVICE_UNAVAILABLE", "A required backend dependency is unavailable.");
      }
      return { status: "ok", timestamp: new Date().toISOString() };
    },

    createIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseInput(createIncidentSchema, request.body);
      const result = await services.incidents.create(input, request.actor!.id, request.ip);
      return reply.code(201).send(result);
    },

    listIncidents: async (request: FastifyRequest) => {
      const input = parseInput(listIncidentsQuerySchema, request.query);
      return services.incidents.list(input, optionalActor(request, config));
    },

    getIncident: async (request: FastifyRequest) =>
      services.incidents.get(trackingIdFrom(request), optionalActor(request, config)),

    setVote: async (request: FastifyRequest) => {
      const input = parseInput(voteSchema, request.body);
      return services.votes.set(trackingIdFrom(request), request.actor!.id, input.type);
    },

    removeVote: async (request: FastifyRequest) =>
      services.votes.remove(trackingIdFrom(request), request.actor!.id),

    reportIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseInput(incidentReportSchema, request.body);
      const result = await services.reports.incident(
        trackingIdFrom(request),
        request.actor!.id,
        input.reason,
      );
      return reply.code(201).send(result);
    },

    listComments: async (request: FastifyRequest) => {
      const input = parseInput(listCommentsQuerySchema, request.query);
      return services.comments.list(
        trackingIdFrom(request),
        optionalActor(request, config),
        input.page,
        input.pageSize,
      );
    },

    createComment: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseInput(createCommentSchema, request.body);
      const result = await services.comments.create(
        trackingIdFrom(request),
        request.actor!.id,
        networkHash(request, config),
        input,
        request.ip,
      );
      return reply.code(201).send(result);
    },

    removeComment: async (request: FastifyRequest, reply: FastifyReply) => {
      await services.comments.remove(commentIdFrom(request), request.actor!.id);
      return reply.code(204).send();
    },

    reportComment: async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseInput(commentReportSchema, request.body);
      const result = await services.reports.comment(
        commentIdFrom(request),
        request.actor!.id,
        input.reason,
      );
      return reply.code(201).send(result);
    },

    track: async (request: FastifyRequest) => {
      const input = parseInput(trackSchema, request.body);
      return services.tracking.track(
        input.trackingId,
        input.secret,
        optionalActor(request, config),
      );
    },

    editIncident: async (request: FastifyRequest) => {
      const input = parseInput(editIncidentSchema, request.body);
      return services.tracking.edit(trackingIdFrom(request), input, request.actor!.id);
    },

    reverseGeocode: async (request: FastifyRequest) => {
      const input = parseInput(reverseGeocodeSchema, request.query);
      return services.geocode.reverse(input.lat!, input.lng!);
    },
  };
}
