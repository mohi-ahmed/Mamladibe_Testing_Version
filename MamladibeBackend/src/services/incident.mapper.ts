import { CommentModel, IncidentModel, ReportModel, VoteModel } from "../models/index.js";

export async function communityCounts(incidentId: unknown) {
  const [support, dispute, flags, comments] = await Promise.all([
    VoteModel.countDocuments({ incidentId, type: "support" }),
    VoteModel.countDocuments({ incidentId, type: "dispute" }),
    ReportModel.countDocuments({ targetType: "incident", targetId: incidentId }),
    CommentModel.countDocuments({ incidentId, status: "published" }),
  ]);
  return { support, dispute, flags, comments };
}

export async function toPublicIncident(document: any, actorId?: string) {
  const object = typeof document.toObject === "function" ? document.toObject() : document;
  const [counts, voteResult, flag] = await Promise.all([
    communityCounts(object._id),
    actorId ? VoteModel.findOne({ incidentId: object._id, actorId }).lean() : null,
    actorId ? ReportModel.exists({ targetType: "incident", targetId: object._id, actorId }) : null,
  ]);
  const vote = voteResult as any;
  const coordinates = object.location.coordinates as [number, number];
  return {
    trackingId: object.trackingId,
    title: object.title,
    description: object.description,
    category: object.category,
    lat: coordinates[1],
    lng: coordinates[0],
    roadName: object.roadName ?? "",
    areaName: object.areaName,
    incidentAt: new Date(object.incidentAt).toISOString(),
    createdAt: new Date(object.createdAt).toISOString(),
    ...(object.safetyTip ? { safetyTip: object.safetyTip } : {}),
    support: counts.support,
    dispute: counts.dispute,
    flags: counts.flags,
    commentCount: counts.comments,
    isEdited: object.isEdited,
    ...(object.editedAt ? { editedAt: new Date(object.editedAt).toISOString() } : {}),
    byModerator: object.byModerator,
    viewerState: {
      vote: vote?.type ?? null,
      hasFlagged: Boolean(flag),
    },
  };
}

export async function requirePublishedIncident(trackingId: string) {
  const incident = await IncidentModel.findOne({ trackingId, status: "published" });
  return incident;
}
