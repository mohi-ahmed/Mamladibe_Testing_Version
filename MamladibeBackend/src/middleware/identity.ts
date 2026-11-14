import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { deriveHmac, randomToken } from "../lib/crypto.js";
import { ensureActorIsAllowed, touchActor } from "../services/actor.service.js";

const COOKIE_NAME = "mdb_anon";

export function optionalActor(request: FastifyRequest, config: AppConfig) {
  const token = request.cookies[COOKIE_NAME];
  if (!token) return undefined;
  return deriveHmac(token, config.ACTOR_HMAC_SECRET);
}

export function networkHash(request: FastifyRequest, config: AppConfig) {
  request.networkHash ??= deriveHmac(request.ip, config.NETWORK_HMAC_SECRET);
  return request.networkHash;
}

export async function requirePublicActor(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
) {
  let token = request.cookies[COOKIE_NAME];
  const isNew = !token;
  if (!token) {
    token = randomToken();
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: config.COOKIE_MAX_AGE_SECONDS,
    });
  }
  const actorId = deriveHmac(token, config.ACTOR_HMAC_SECRET);
  const requestNetworkHash = networkHash(request, config);
  request.actor = { id: actorId, token, isNew };
  await Promise.all([ensureActorIsAllowed(actorId, requestNetworkHash), touchActor(actorId)]);
}

export function requireAllowedOrigin(request: FastifyRequest, config: AppConfig) {
  const origin = request.headers.origin;
  if (!origin || !config.allowedOrigins.includes(origin)) {
    throw new AppError("ORIGIN_NOT_ALLOWED", "The request origin is not allowed.");
  }
}
