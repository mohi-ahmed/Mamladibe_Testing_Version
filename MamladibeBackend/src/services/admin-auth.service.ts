import mongoose from "mongoose";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import {
  createTotpEnrollment,
  decryptTotpSecret,
  encryptTotpSecret,
  hashAdminPassword,
  hashOpaqueToken,
  verifyAdminPassword,
  verifyTotp,
} from "../lib/admin-security.js";
import { randomToken } from "../lib/crypto.js";
import { AdminSessionModel, AdminUserModel } from "../models/admin.js";
import { writeAudit } from "./audit.service.js";

export const ADMIN_SESSION_COOKIE = "mdb_admin";
export const ADMIN_CSRF_COOKIE = "mdb_admin_csrf";
export const ADMIN_ENROL_COOKIE = "mdb_admin_enrol";

export function nextLoginFailure(
  currentFailures: number,
  maximumFailures: number,
  lockSeconds: number,
  now = new Date(),
) {
  const failedLogins = currentFailures + 1;
  return {
    failedLogins,
    lockedUntil:
      failedLogins >= maximumFailures ? new Date(now.getTime() + lockSeconds * 1_000) : undefined,
  };
}

export class AdminAuthService {
  private readonly dummyPasswordHash = hashAdminPassword("invalid-admin-password-placeholder");

  constructor(private readonly config: AppConfig) {}

  async login(input: { email: string; password: string; totpCode: string }) {
    const now = new Date();
    const admin = await AdminUserModel.findOne({ email: input.email })
      .select("+passwordHash +totpSecretEncrypted")
      .exec();

    if (admin?.lockedUntil && admin.lockedUntil > now) {
      throw new AppError(
        "ADMIN_ACCOUNT_LOCKED",
        "The administrator account is temporarily locked.",
        {
          details: {
            retryAfterSeconds: Math.ceil((admin.lockedUntil.getTime() - now.getTime()) / 1_000),
          },
        },
      );
    }

    const encoded = admin?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordValid = await verifyAdminPassword(encoded, input.password).catch(() => false);
    let totpValid = false;
    if (admin?.totpSecretEncrypted && passwordValid) {
      const secret = decryptTotpSecret(admin.totpSecretEncrypted, this.config.TOTP_ENCRYPTION_KEY);
      totpValid = await verifyTotp(secret, input.totpCode).catch(() => false);
    }

    if (!admin || !admin.active || !passwordValid || !totpValid) {
      if (admin) {
        const failure = nextLoginFailure(
          admin.failedLogins,
          this.config.ADMIN_LOGIN_MAX_FAILURES,
          this.config.ADMIN_LOGIN_LOCK_SECONDS,
          now,
        );
        admin.failedLogins = failure.failedLogins;
        admin.lockedUntil = failure.lockedUntil;
        const failureSession = await mongoose.startSession();
        try {
          await failureSession.withTransaction(async () => {
            await admin.save({ session: failureSession });
            await writeAudit(
              {
                adminId: admin.id,
                action: "auth.login_failed",
                targetType: "admin",
                targetId: admin.id,
                reason: "Invalid administrator login attempt",
              },
              failureSession,
            );
          });
        } finally {
          await failureSession.endSession();
        }
        if (admin.lockedUntil) {
          throw new AppError(
            "ADMIN_ACCOUNT_LOCKED",
            "The administrator account is temporarily locked.",
            {
              details: { retryAfterSeconds: this.config.ADMIN_LOGIN_LOCK_SECONDS },
            },
          );
        }
      }
      throw new AppError("ADMIN_CREDENTIALS_INVALID", "Administrator credentials are invalid.");
    }

    const sessionToken = randomToken(32);
    const csrfToken = randomToken(24);
    const absoluteExpiresAt = new Date(
      now.getTime() + this.config.ADMIN_SESSION_ABSOLUTE_SECONDS * 1_000,
    );
    const mongoSession = await mongoose.startSession();
    let createdSession: any;
    try {
      await mongoSession.withTransaction(async () => {
        admin.failedLogins = 0;
        admin.lockedUntil = undefined;
        admin.lastLoginAt = now;
        await admin.save({ session: mongoSession });
        [createdSession] = await AdminSessionModel.create(
          [
            {
              adminId: admin._id,
              sessionHash: hashOpaqueToken(sessionToken),
              csrfHash: hashOpaqueToken(csrfToken),
              lastSeenAt: now,
              expiresAt: absoluteExpiresAt,
            },
          ],
          { session: mongoSession },
        );
        await writeAudit(
          {
            adminId: admin.id,
            action: "auth.login",
            targetType: "admin",
            targetId: admin.id,
            reason: "Administrator signed in",
          },
          mongoSession,
        );
      });
    } finally {
      await mongoSession.endSession();
    }
    return { admin, session: createdSession, sessionToken, csrfToken, absoluteExpiresAt };
  }

  async startEnrollment(input: { token: string; password: string }) {
    const admin = await AdminUserModel.findOne({
      enrollmentTokenHash: hashOpaqueToken(input.token),
      enrollmentExpiresAt: { $gt: new Date() },
      active: false,
    }).select("+enrollmentTokenHash");
    if (!admin)
      throw new AppError("ENROLMENT_EXPIRED", "The enrolment token is invalid or expired.");

    const enrollment = createTotpEnrollment(admin.email);
    const cookieToken = randomToken(32);
    admin.passwordHash = await hashAdminPassword(input.password);
    admin.totpSecretEncrypted = encryptTotpSecret(
      enrollment.secret,
      this.config.TOTP_ENCRYPTION_KEY,
    );
    admin.enrollmentTokenHash = undefined;
    admin.enrollmentExpiresAt = undefined;
    admin.enrollmentSessionHash = hashOpaqueToken(cookieToken);
    admin.enrollmentSessionExpiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    await admin.save();
    return { cookieToken, otpauthUri: enrollment.otpauthUri };
  }

  async verifyEnrollment(cookieToken: string | undefined, totpCode: string) {
    if (!cookieToken)
      throw new AppError("ENROLMENT_EXPIRED", "The enrolment session is invalid or expired.");
    const admin = await AdminUserModel.findOne({
      enrollmentSessionHash: hashOpaqueToken(cookieToken),
      enrollmentSessionExpiresAt: { $gt: new Date() },
      active: false,
    }).select("+totpSecretEncrypted +enrollmentSessionHash");
    if (!admin?.totpSecretEncrypted)
      throw new AppError("ENROLMENT_EXPIRED", "The enrolment session is invalid or expired.");
    const secret = decryptTotpSecret(admin.totpSecretEncrypted, this.config.TOTP_ENCRYPTION_KEY);
    if (!(await verifyTotp(secret, totpCode)))
      throw new AppError("ADMIN_CREDENTIALS_INVALID", "The verification code is invalid.");
    admin.active = true;
    admin.enrolledAt = new Date();
    admin.enrollmentSessionHash = undefined;
    admin.enrollmentSessionExpiresAt = undefined;
    await admin.save();
  }
}
