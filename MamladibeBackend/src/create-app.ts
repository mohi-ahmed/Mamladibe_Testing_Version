import { randomUUID } from "node:crypto";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";
import mongoose from "mongoose";

import { loadConfig, type AppConfig } from "./config/env.js";
import { createPublicController } from "./controllers/public.controller.js";
import { AppError } from "./lib/app-error.js";
import { CaptchaService } from "./services/captcha.service.js";
import { CommentService } from "./services/comment.service.js";
import { GeocodeService } from "./services/geocode.service.js";
import { IncidentService } from "./services/incident.service.js";
import {
  InMemoryFeedCache,
  type FeedCache,
  UpstashFeedCache,
} from "./services/feed-cache.service.js";
import {
  InMemoryCommentQuotaStore,
  type CommentQuotaStore,
  UpstashCommentQuotaStore,
} from "./services/quota.service.js";
import {
  InMemoryRateLimitStore,
  type RateLimitStore,
  UpstashRateLimitStore,
} from "./services/rate-limit.service.js";
import { ReportService } from "./services/report.service.js";
import { TrackingService } from "./services/tracking.service.js";
import { VoteService } from "./services/vote.service.js";
import { registerPublicRoutes } from "./routes/public.routes.js";
import { registerAdminRoutes } from "./routes/admin.routes.js";

export interface AppOptions {
  config?: AppConfig;
  databaseReady?: Promise<unknown>;
  quota?: CommentQuotaStore;
  rateLimit?: RateLimitStore;
  feedCache?: FeedCache;
  logger?: boolean;
}

function createQuota(config: AppConfig) {
  if (config.hasRedis) {
    return new UpstashCommentQuotaStore(
      config.UPSTASH_REDIS_REST_URL,
      config.UPSTASH_REDIS_REST_TOKEN,
    );
  }
  return new InMemoryCommentQuotaStore();
}

function createRateLimit(config: AppConfig) {
  if (config.hasRedis) {
    return new UpstashRateLimitStore(
      config.UPSTASH_REDIS_REST_URL,
      config.UPSTASH_REDIS_REST_TOKEN,
    );
  }
  return new InMemoryRateLimitStore();
}

function createFeedCache(config: AppConfig) {
  if (config.hasRedis) {
    return new UpstashFeedCache(config.UPSTASH_REDIS_REST_URL, config.UPSTASH_REDIS_REST_TOKEN);
  }
  return new InMemoryFeedCache();
}

export function buildApp(options: AppOptions = {}) {
  const config = options.config ?? loadConfig();
  const quota = options.quota ?? createQuota(config);
  const rateLimit = options.rateLimit ?? createRateLimit(config);
  const feedCache = options.feedCache ?? createFeedCache(config);
  const loggingEnabled = options.logger ?? config.NODE_ENV !== "test";
  const app = Fastify({
    logger: loggingEnabled
      ? {
          redact: {
            paths: [
              "req.headers.cookie",
              "req.headers.authorization",
              "req.body.secret",
              "req.body.captchaToken",
              "res.headers.set-cookie",
            ],
            censor: "[REDACTED]",
          },
        }
      : false,
    trustProxy: config.TRUST_PROXY,
    genReqId: () => `req_${randomUUID()}`,
    bodyLimit: 256 * 1_024,
  });

  app.register(cookie);
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  if (options.databaseReady) {
    app.addHook("onRequest", async () => {
      await options.databaseReady;
    });
  }

  const captcha = new CaptchaService(
    config.TURNSTILE_SECRET,
    !config.isProduction && !config.TURNSTILE_SECRET,
  );
  const services = {
    incidents: new IncidentService(config, captcha, feedCache),
    votes: new VoteService(),
    reports: new ReportService(),
    comments: new CommentService(quota, captcha),
    tracking: new TrackingService(config),
    geocode: new GeocodeService(config),
    quota,
    rateLimit,
  };
  const controller = createPublicController(config, services);
  registerPublicRoutes(app, config, controller, rateLimit);
  registerAdminRoutes(app, config, rateLimit, feedCache);

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Resource not found.",
          requestId: request.id,
        },
      });
    }
    return reply.code(404).send("Not Found");
  });

  app.setErrorHandler((error, request, reply) => {
    let appError: AppError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof mongoose.Error.CastError) {
      appError = new AppError("NOT_FOUND", "Resource not found.");
    } else if ((error as { code?: number }).code === 11000) {
      appError = new AppError("CONFLICT", "The requested operation conflicts with existing data.");
    } else if ((error as { statusCode?: number }).statusCode === 400) {
      appError = new AppError("VALIDATION_ERROR", "The request body is malformed.");
    } else {
      request.log.error({ err: error, requestId: request.id }, "Unhandled request error");
      appError = new AppError("INTERNAL_ERROR", "An unexpected error occurred.");
    }

    return reply.code(appError.status).send({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.options.fieldErrors ? { fieldErrors: appError.options.fieldErrors } : {}),
        ...(appError.options.details ? { details: appError.options.details } : {}),
        requestId: request.id,
      },
    });
  });

  return app;
}
