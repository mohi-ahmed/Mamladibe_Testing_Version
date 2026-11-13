import mongoose, { type Model } from "mongoose";

const { model, models, Schema } = mongoose;

import { COMMENT_FLAG_REASONS, INCIDENT_FLAG_REASONS } from "../lib/constants.js";

const reportSchema = new Schema(
  {
    targetType: { type: String, enum: ["incident", "comment"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    actorId: { type: String, required: true, select: false },
    reason: {
      type: String,
      required: true,
      validate: {
        validator(this: { targetType: "incident" | "comment" }, value: string) {
          const values =
            this.targetType === "incident" ? INCIDENT_FLAG_REASONS : COMMENT_FLAG_REASONS;
          return (values as readonly string[]).includes(value);
        },
        message: "Reason does not match report target type",
      },
    },
    reviewStatus: {
      type: String,
      enum: ["pending", "reviewed"],
      required: true,
      default: "pending",
    },
    outcome: { type: String, enum: ["kept", "hidden", "removed"] },
    note: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    reviewedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

reportSchema.index({ targetType: 1, targetId: 1, actorId: 1 }, { unique: true });
reportSchema.index({ reviewStatus: 1, createdAt: 1 });
reportSchema.index({ targetType: 1, targetId: 1 });

export const ReportModel = (models.Report ?? model("Report", reportSchema)) as Model<any>;
