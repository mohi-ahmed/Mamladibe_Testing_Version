import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { model, models, Schema } = mongoose;

import { CATEGORIES, CONTENT_STATUSES } from "../lib/constants.js";

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], required: true, default: "Point" },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]) => value.length === 2,
        message: "A GeoJSON point requires [lng, lat]",
      },
    },
  },
  { _id: false },
);

const incidentSchema = new Schema(
  {
    trackingId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    secretHash: { type: String, required: false, select: false },
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 100 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 2_000 },
    category: { type: String, required: true, enum: CATEGORIES },
    incidentAt: { type: Date, required: true },
    location: { type: pointSchema, required: true },
    roadName: { type: String, trim: true, default: "" },
    areaName: { type: String, required: true, trim: true },
    safetyTip: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: CONTENT_STATUSES, default: "published", required: true },
    actorId: { type: String, select: false },
    source: { type: String, enum: ["public", "admin"], required: true, default: "public" },
    adminLabel: { type: String, enum: ["official", "test"] },
    contentHash: { type: String, required: true, select: false },
    isEdited: { type: Boolean, required: true, default: false },
    editedAt: Date,
    byModerator: { type: Boolean, required: true, default: false },
    hiddenAt: Date,
    deletedAt: Date,
    purgeAt: Date,
  },
  { timestamps: true, versionKey: false },
);

incidentSchema.index({ location: "2dsphere" });
incidentSchema.index({ status: 1, createdAt: -1 });
incidentSchema.index({ status: 1, category: 1, createdAt: -1 });
incidentSchema.index({ actorId: 1, createdAt: -1 });
incidentSchema.index({ title: "text", description: "text", roadName: "text", areaName: "text" });
incidentSchema.index({ contentHash: 1, createdAt: -1 });
incidentSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export type Incident = InferSchemaType<typeof incidentSchema>;
export const IncidentModel = (models.Incident ?? model("Incident", incidentSchema)) as Model<any>;
