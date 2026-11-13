import type { ClientSession } from "mongoose";

import { AuditLogModel } from "../models/admin.js";

export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.login_failed",
  "incident.create",
  "incident.redact",
  "incident.hide",
  "incident.unhide",
  "incident.delete",
  "incident.restore",
  "incident.purge",
  "comment.hide",
  "comment.unhide",
  "comment.delete",
  "comment.restore",
  "comment.purge",
  "flag.review",
  "activity.view",
  "actor.note",
  "bulk.remove",
  "block.create",
  "block.remove",
  "admin.create",
  "admin.update",
  "admin.reset_2fa",
  "settings.update",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditTarget =
  "incident" | "comment" | "flag" | "vote" | "actor" | "block" | "admin" | "settings";

const BLOCKED_KEYS = /password|secret|token|hash|cookie|totp|csrf|session|ip(address)?/i;

export function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeAuditValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !BLOCKED_KEYS.test(key))
        .map(([key, child]) => [key, sanitizeAuditValue(child)]),
    );
  }
  if (typeof value === "string") return value.slice(0, 500);
  return value;
}

export async function writeAudit(
  entry: {
    adminId: string;
    action: AuditAction;
    targetType: AuditTarget;
    targetId: string;
    reason: string;
    before?: unknown;
    after?: unknown;
  },
  session?: ClientSession,
) {
  const document = {
    ...entry,
    before: sanitizeAuditValue(entry.before),
    after: sanitizeAuditValue(entry.after),
  };
  const [created] = await AuditLogModel.create([document], session ? { session } : undefined);
  return created;
}
