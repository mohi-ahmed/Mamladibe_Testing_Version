import mongoose, { type Model } from "mongoose";

const { model, models, Schema } = mongoose;

import { COMMENT_TYPES, CONTENT_STATUSES } from "../lib/constants.js";

const commentSchema = new Schema(
  {
    incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true },
    actorId: { type: String, required: true, select: false },
    type: { type: String, enum: COMMENT_TYPES, required: true },
    text: { type: String, required: true, trim: true, minlength: 5, maxlength: 500 },
    status: { type: String, enum: CONTENT_STATUSES, required: true, default: "published" },
    hiddenAt: Date,
    deletedAt: Date,
    purgeAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

commentSchema.index({ incidentId: 1, status: 1, createdAt: -1 });
commentSchema.index({ actorId: 1, createdAt: -1 });
commentSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export const CommentModel = (models.Comment ?? model("Comment", commentSchema)) as Model<any>;
