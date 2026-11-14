import { AppError } from "../lib/app-error.js";
import { VoteModel } from "../models/index.js";
import { requirePublishedIncident } from "./incident.mapper.js";

export class VoteService {
  async set(trackingId: string, actorId: string, type: "support" | "dispute") {
    const incident = await requirePublishedIncident(trackingId);
    if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
    await VoteModel.findOneAndUpdate(
      { incidentId: incident._id, actorId },
      { $set: { type } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return { vote: type };
  }

  async remove(trackingId: string, actorId: string) {
    const incident = await requirePublishedIncident(trackingId);
    if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
    await VoteModel.deleteOne({ incidentId: incident._id, actorId });
    return { vote: null };
  }
}
