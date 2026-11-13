import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { hashOpaqueToken, safeTokenEqual } from "../lib/admin-security.js";
import { AdminSessionModel, AdminUserModel } from "../models/admin.js";
import { ADMIN_CSRF_COOKIE, ADMIN_SESSION_COOKIE } from "../services/admin-auth.service.js";

export type AdminRole = "moderator" | "super_admin";

export function assertAdminRole(actual: AdminRole, allowed: readonly AdminRole[]) {
  if (!allowed.includes(actual))
    throw new AppError("FORBIDDEN", "This administrator role cannot perform the action.");
}

export function adminSessionIsExpired(
  absoluteExpiresAt: Date,
  lastSeenAt: Date,
  idleSeconds: number,
  now = new Date(),
) {
  return absoluteExpiresAt <= now || lastSeenAt.getTime() + idleSeconds * 1_000 <= now.getTime();
}

export function csrfIsValid(
  cookie: string | undefined,
  header: string | undefined,
  storedHash: string,
) {
  return Boolean(
    cookie &&
    header &&
    safeTokenEqual(cookie, header) &&
    safeTokenEqual(storedHash, hashOpaqueToken(header)),
  );
}

export function createAdminGuards(config: AppConfig) {
  const authenticate = async (request: FastifyRequest) => {
    const token = request.cookies[ADMIN_SESSION_COOKIE];
    if (!token) throw new AppError("UNAUTHORIZED", "Administrator authentication is required.");
    const session = await AdminSessionModel.findOne({ sessionHash: hashOpaqueToken(token) })
      .select("+sessionHash +csrfHash")
      .exec();
    if (!session) throw new AppError("UNAUTHORIZED", "Administrator authentication is required.");

    const now = new Date();
    const idleExpiresAt = new Date(
      session.lastSeenAt.getTime() + config.ADMIN_SESSION_IDLE_SECONDS * 1_000,
    );
    if (
      adminSessionIsExpired(
        session.expiresAt,
        session.lastSeenAt,
        config.ADMIN_SESSION_IDLE_SECONDS,
        now,
      )
    ) {
      await AdminSessionModel.deleteOne({ _id: session._id });
      throw new AppError("UNAUTHORIZED", "The administrator session has expired.");
    }
    const admin: any = await AdminUserModel.findById(session.adminId).lean();
    if (!admin?.active) {
      await AdminSessionModel.deleteOne({ _id: session._id });
      throw new AppError("UNAUTHORIZED", "Administrator authentication is required.");
    }
    request.admin = {
      id: String(admin._id),
      email: admin.email,
      role: admin.role,
      sessionId: String(session._id),
      absoluteExpiresAt: session.expiresAt,
      idleExpiresAt,
    };
    if (now.getTime() - session.lastSeenAt.getTime() >= 60_000) {
      await AdminSessionModel.updateOne({ _id: session._id }, { $set: { lastSeenAt: now } });
      request.admin.idleExpiresAt = new Date(
        now.getTime() + config.ADMIN_SESSION_IDLE_SECONDS * 1_000,
      );
    }
  };

  const mutation = async (request: FastifyRequest) => {
    await authenticate(request);
    const origin = request.headers.origin;
    if (!origin || !config.allowedOrigins.includes(origin))
      throw new AppError("ORIGIN_NOT_ALLOWED", "The request origin is not allowed.");
    const cookie = request.cookies[ADMIN_CSRF_COOKIE];
    const headerValue = request.headers["x-csrf-token"];
    const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!cookie || !header || !safeTokenEqual(cookie, header))
      throw new AppError("CSRF_INVALID", "The CSRF token is invalid.");
    const session: any = await AdminSessionModel.findById(request.admin!.sessionId)
      .select("+csrfHash")
      .lean();
    if (!session || !csrfIsValid(cookie, header, session.csrfHash))
      throw new AppError("CSRF_INVALID", "The CSRF token is invalid.");
  };

  const roles =
    (allowed: readonly AdminRole[], mutate = false) =>
    async (request: FastifyRequest, _reply: FastifyReply) => {
      if (mutate) await mutation(request);
      else await authenticate(request);
      assertAdminRole(request.admin!.role, allowed);
    };
  return { authenticate, mutation, roles };
}
