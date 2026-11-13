import mongoose, { type Model } from "mongoose";

const { model, models, Schema } = mongoose;

const geoCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    roadName: String,
    areaName: String,
    provider: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
geoCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GeoCacheModel = (models.GeoCache ?? model("GeoCache", geoCacheSchema)) as Model<any>;
