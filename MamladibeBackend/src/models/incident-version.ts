import mongoose, { type Model } from "mongoose";

const { model, models, Schema } = mongoose;

const incidentVersionSchema = new Schema(
  {
    incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true },
    description: { type: String, required: true },
    safetyTip: String,
    savedAt: { type: Date, required: true },
    editedBy: { type: String, enum: ["reporter", "moderator"], required: true },
    adminId: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    reason: String,
  },
  { versionKey: false },
);

incidentVersionSchema.index({ incidentId: 1, version: 1 }, { unique: true });

export const IncidentVersionModel = (models.IncidentVersion ??
  model("IncidentVersion", incidentVersionSchema)) as Model<any>;
