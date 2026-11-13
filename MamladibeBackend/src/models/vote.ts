import mongoose, { type Model } from "mongoose";

const { model, models, Schema } = mongoose;

import { VOTE_TYPES } from "../lib/constants.js";

const voteSchema = new Schema(
  {
    incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true },
    actorId: { type: String, required: true, select: false },
    type: { type: String, enum: VOTE_TYPES, required: true },
  },
  { timestamps: true, versionKey: false },
);

voteSchema.index({ incidentId: 1, actorId: 1 }, { unique: true });

export const VoteModel = (models.Vote ?? model("Vote", voteSchema)) as Model<any>;
