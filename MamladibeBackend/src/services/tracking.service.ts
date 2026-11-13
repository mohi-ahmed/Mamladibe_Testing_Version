import mongoose from "mongoose";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { verifyReporterSecret } from "../lib/crypto.js";
import { combineEditableText, changeRatio } from "../lib/text.js";
import { RULES } from "../lib/constants.js";
import { IncidentModel, IncidentVersionModel } from "../models/index.js";
import { toPublicIncident } from "./incident.mapper.js";

interface EditInput {
  secret: string;
  title: string;
  description: string;
  safetyTip?: string | undefined;
}

export class TrackingService {
  constructor(private readonly config: AppConfig) {}

  private async authenticate(trackingId: string, secret: string) {
    const incident = await IncidentModel.findOne({ trackingId }).select("+secretHash");
    const valid =
      incident?.secretHash &&
      (await verifyReporterSecret(secret, incident.secretHash, this.config.REPORTER_SECRET_PEPPER));
    if (!incident || !valid) {
      throw new AppError("TRACKING_CREDENTIALS_INVALID", "Tracking ID or Secret is incorrect.");
    }
    return incident;
  }

  async track(trackingId: string, secret: string, actorId?: string) {
    const incident = await this.authenticate(trackingId, secret);
    const now = Date.now();
    const deadline = incident.createdAt.getTime() + RULES.quickEditMs;
    const versions = await IncidentVersionModel.find({ incidentId: incident._id })
      .sort({ version: 1 })
      .lean();
    return {
      incident: await toPublicIncident(incident, actorId),
      status: incident.status,
      versions: versions.map((version) => ({
        version: version.version,
        title: version.title,
        description: version.description,
        ...(version.safetyTip ? { safetyTip: version.safetyTip } : {}),
        savedAt: version.savedAt.toISOString(),
      })),
      edit: {
        allowed: now <= deadline,
        deadline: new Date(deadline).toISOString(),
        remainingSeconds: Math.max(0, Math.floor((deadline - now) / 1_000)),
        maxChangeRatio: RULES.maxEditChangeRatio,
      },
    };
  }

  async edit(trackingId: string, input: EditInput, actorId?: string) {
    const incident = await this.authenticate(trackingId, input.secret);
    const now = new Date();
    if (now.getTime() > incident.createdAt.getTime() + RULES.quickEditMs) {
      throw new AppError("EDIT_WINDOW_EXPIRED", "The 15-minute edit window has ended.");
    }
    const currentText = combineEditableText(incident);
    const nextText = combineEditableText(input);
    if (changeRatio(currentText, nextText) > RULES.maxEditChangeRatio) {
      throw new AppError(
        "EDIT_CHANGE_TOO_LARGE",
        "The requested edit changes more than 20 percent of the report.",
      );
    }

    const versionNumber =
      (await IncidentVersionModel.countDocuments({ incidentId: incident._id })) + 1;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await IncidentVersionModel.create(
          [
            {
              incidentId: incident._id,
              version: versionNumber,
              title: incident.title,
              description: incident.description,
              ...(incident.safetyTip ? { safetyTip: incident.safetyTip } : {}),
              savedAt: now,
              editedBy: "reporter",
            },
          ],
          { session },
        );
        const updated = await IncidentModel.updateOne(
          {
            _id: incident._id,
            updatedAt: incident.updatedAt,
            createdAt: { $gte: new Date(now.getTime() - RULES.quickEditMs) },
          },
          {
            $set: {
              title: input.title,
              description: input.description,
              safetyTip: input.safetyTip ?? undefined,
              isEdited: true,
              editedAt: now,
            },
          },
          { session },
        );
        if (updated.modifiedCount !== 1) {
          throw new AppError("CONFLICT", "The incident changed while it was being edited.");
        }
      });
    } finally {
      await session.endSession();
    }
    const updated = await IncidentModel.findById(incident._id);
    if (!updated) throw new AppError("CONFLICT", "The incident changed while it was being edited.");
    return {
      incident: await toPublicIncident(updated, actorId),
      version: { version: versionNumber, savedAt: now.toISOString() },
    };
  }
}
