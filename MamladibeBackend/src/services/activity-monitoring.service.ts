import type { FastifyRequest } from "fastify";

import { AppError } from "../lib/app-error.js";
import { RateEventModel } from "../models/index.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

type MonitoredAction = "incident" | "comment" | "vote" | "flag" | "track";

function routeDetails(request: FastifyRequest): { action: MonitoredAction; targetId?: string } | null {
  const method = request.method.toUpperCase();
  const path = request.url.split("?")[0] ?? "";
  const params = request.params as { trackingId?: string; commentId?: string };

  if (method === "POST" && path === "/api/incidents") return { action: "incident" };
  if (path.endsWith("/vote") && (method === "POST" || method === "DELETE"))
    return {
      action: "vote",
      ...(params.trackingId ? { targetId: params.trackingId.toUpperCase() } : {}),
    };
  if (method === "POST" && path.endsWith("/comments"))
    return {
      action: "comment",
      ...(params.trackingId ? { targetId: params.trackingId.toUpperCase() } : {}),
    };
  if (method === "DELETE" && path.startsWith("/api/comments/"))
    return { action: "comment", ...(params.commentId ? { targetId: params.commentId } : {}) };
  if (method === "POST" && path.endsWith("/report"))
    return {
      action: "flag",
      ...(params.trackingId
        ? { targetId: params.trackingId.toUpperCase() }
        : params.commentId
          ? { targetId: params.commentId }
          : {}),
    };
  if (method === "POST" && path === "/api/track") return { action: "track" };
  if (method === "PATCH" && path.endsWith("/edit"))
    return {
      action: "track",
      ...(params.trackingId ? { targetId: params.trackingId.toUpperCase() } : {}),
    };
  return null;
}

function failureReason(error: unknown) {
  if (!(error instanceof AppError)) return "internal_error";
  const supplied = error.options.details?.rateLimitReason;
  if (typeof supplied === "string") return supplied;
  const reasons: Partial<Record<AppError["code"], string>> = {
    CAPTCHA_FAILED: "captcha_failed",
    VALIDATION_ERROR: "invalid_submission",
    DUPLICATE_INCIDENT: "duplicate_content_location",
    COMMENT_LIMIT_EXCEEDED: "comment_quota",
    ACTOR_BLOCKED: "subject_blocked",
    ORIGIN_NOT_ALLOWED: "origin_rejected",
    FUTURE_INCIDENT_TIME: "invalid_incident_time",
    OUTSIDE_BANGLADESH: "outside_bangladesh",
    SERVICE_UNAVAILABLE: "service_unavailable",
  };
  return reasons[error.code] ?? error.code.toLowerCase();
}

function failureResult(error: unknown): "blocked" | "failed" {
  if (
    error instanceof AppError &&
    ["RATE_LIMITED", "COMMENT_LIMIT_EXCEEDED", "ACTOR_BLOCKED"].includes(error.code)
  )
    return "blocked";
  return "failed";
}

export class ActivityMonitoringService {
  async recordSuccess(request: FastifyRequest, statusCode: number) {
    const details = routeDetails(request);
    if (!details || statusCode >= 400) return;
    await this.create(request, details, "accepted", "accepted", statusCode);
  }

  async recordFailure(request: FastifyRequest, error: unknown, statusCode: number) {
    const details = routeDetails(request);
    if (!details) return;
    await this.create(
      request,
      details,
      failureResult(error),
      failureReason(error),
      statusCode,
      error instanceof AppError && typeof error.options.details?.retryAfterSeconds === "number"
        ? error.options.details.retryAfterSeconds
        : undefined,
    );
  }

  private async create(
    request: FastifyRequest,
    details: { action: MonitoredAction; targetId?: string },
    result: "accepted" | "blocked" | "failed",
    reason: string,
    statusCode: number,
    retryAfterSeconds?: number,
  ) {
    const actorId = request.actor?.id;
    const networkHash = request.networkHash;
    await RateEventModel.create({
      ...(actorId ? { actorId } : {}),
      ...(networkHash ? { networkHash } : {}),
      action: details.action,
      result,
      reason,
      ...(details.targetId ? { targetId: details.targetId } : {}),
      statusCode,
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      duplicateSignal: reason === "duplicate_content_location",
      expiresAt: new Date(Date.now() + RETENTION_MS),
    });
  }
}

