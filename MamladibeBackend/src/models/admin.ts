import mongoose, { type Model } from "mongoose";

const { model, models, Schema } = mongoose;

const adminUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ["moderator", "super_admin"], required: true },
    totpSecretEncrypted: { type: String, select: false },
    active: { type: Boolean, required: true, default: false },
    enrollmentTokenHash: { type: String, select: false },
    enrollmentExpiresAt: Date,
    enrollmentSessionHash: { type: String, select: false },
    enrollmentSessionExpiresAt: Date,
    enrolledAt: Date,
    failedLogins: { type: Number, required: true, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
  },
  { timestamps: true, versionKey: false },
);
adminUserSchema.index({ role: 1, active: 1 });

const adminSessionSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    sessionHash: { type: String, required: true, unique: true, select: false },
    csrfHash: { type: String, required: true, select: false },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const auditLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    action: {
      type: String,
      enum: [
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
      ],
      required: true,
    },
    targetType: {
      type: String,
      enum: ["incident", "comment", "flag", "vote", "actor", "block", "admin", "settings"],
      required: true,
    },
    targetId: { type: String, required: true },
    reason: { type: String, required: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });
for (const operation of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const) {
  auditLogSchema.pre(operation, function denyAuditMutation() {
    throw new Error("Audit logs are append-only.");
  });
}

export const AdminUserModel = (models.AdminUser ??
  model("AdminUser", adminUserSchema)) as Model<any>;
export const AdminSessionModel = (models.AdminSession ??
  model("AdminSession", adminSessionSchema)) as Model<any>;
export const AuditLogModel = (models.AuditLog ?? model("AuditLog", auditLogSchema)) as Model<any>;

const platformSettingsSchema = new Schema(
  {
    _id: { type: String, default: "platform" },
    freezeIncidentPosting: { type: Boolean, required: true, default: false },
    freezeComments: { type: Boolean, required: true, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true, versionKey: false },
);

export interface PlatformSettingsRecord {
  _id: string;
  freezeIncidentPosting: boolean;
  freezeComments: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export const PlatformSettingsModel = (models.PlatformSettings ??
  model<PlatformSettingsRecord>(
    "PlatformSettings",
    platformSettingsSchema,
  )) as Model<PlatformSettingsRecord>;
