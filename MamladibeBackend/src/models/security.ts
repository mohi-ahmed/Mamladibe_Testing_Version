import mongoose, { type Model } from "mongoose";

const { model, models, Schema } = mongoose;

const actorSchema = new Schema(
  {
    actorId: { type: String, required: true, unique: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    notes: {
      type: [
        new Schema(
          {
            adminId: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
            text: { type: String, required: true, maxlength: 1_000 },
            createdAt: { type: Date, required: true },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

const rateEventSchema = new Schema(
  {
    actorId: { type: String, select: false },
    networkHash: { type: String, select: false },
    action: {
      type: String,
      enum: ["incident", "comment", "vote", "flag", "track", "admin_login"],
      required: true,
    },
    result: {
      type: String,
      enum: ["allowed", "limited", "captcha_required", "blocked"],
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
rateEventSchema.index({ actorId: 1, action: 1, createdAt: -1 });
rateEventSchema.index({ networkHash: 1, action: 1, createdAt: -1 });
rateEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const blockSchema = new Schema(
  {
    targetType: { type: String, enum: ["anonymous_id", "network_hash"], required: true },
    targetHash: { type: String, required: true, select: false },
    mode: { type: String, enum: ["temporary", "permanent"], required: true },
    reason: { type: String, required: true },
    expiresAt: Date,
    active: { type: Boolean, required: true, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    removedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    removedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
blockSchema.index({ targetType: 1, targetHash: 1, active: 1 });

export const ActorModel = (models.Actor ?? model("Actor", actorSchema)) as Model<any>;
export const RateEventModel = (models.RateEvent ??
  model("RateEvent", rateEventSchema)) as Model<any>;
export const BlockModel = (models.Block ?? model("Block", blockSchema)) as Model<any>;
