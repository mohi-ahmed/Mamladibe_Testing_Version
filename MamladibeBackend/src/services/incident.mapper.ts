import { CommentModel, IncidentModel, ReportModel, VoteModel } from "../models/index.js";

type Counts = { support: number; dispute: number; flags: number; comments: number };

const emptyCounts = (): Counts => ({ support: 0, dispute: 0, flags: 0, comments: 0 });

function publicIncident(document: any, counts: Counts, vote: string | null, hasFlagged: boolean) {
  const object = typeof document.toObject === "function" ? document.toObject() : document;
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
    viewerState: { vote, hasFlagged },
  };
}

export async function communityCounts(incidentId: unknown) {
  const [votes, flags, comments] = await Promise.all([
    VoteModel.aggregate([
      { $match: { incidentId } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]),
    ReportModel.countDocuments({ targetType: "incident", targetId: incidentId }),
    CommentModel.countDocuments({ incidentId, status: "published" }),
  ]);
  const byType = new Map((votes as any[]).map((row) => [row._id, row.count]));
  return {
    support: byType.get("support") ?? 0,
    dispute: byType.get("dispute") ?? 0,
    flags,
    comments,
  };
}

export async function toPublicIncident(document: any, actorId?: string) {
  const object = typeof document.toObject === "function" ? document.toObject() : document;
  const [counts, voteResult, flag] = await Promise.all([
    communityCounts(object._id),
    actorId ? VoteModel.findOne({ incidentId: object._id, actorId }).lean() : null,
    actorId ? ReportModel.exists({ targetType: "incident", targetId: object._id, actorId }) : null,
  ]);
  const vote = voteResult as any;
  return publicIncident(document, counts, vote?.type ?? null, Boolean(flag));
}

/** Maps a page of incidents with a fixed number of queries instead of querying per row. */
export async function toPublicIncidents(documents: any[], actorId?: string) {
  if (documents.length === 0) return [];
  const objects = documents.map((document) =>
    typeof document.toObject === "function" ? document.toObject() : document,
  );
  const ids = objects.map((object) => object._id);
  const [voteCounts, flagCounts, commentCounts, viewerVotes, viewerFlags] = await Promise.all([
    VoteModel.aggregate([
      { $match: { incidentId: { $in: ids } } },
      { $group: { _id: { incidentId: "$incidentId", type: "$type" }, count: { $sum: 1 } } },
    ]),
    ReportModel.aggregate([
      { $match: { targetType: "incident", targetId: { $in: ids } } },
      { $group: { _id: "$targetId", count: { $sum: 1 } } },
    ]),
    CommentModel.aggregate([
      { $match: { incidentId: { $in: ids }, status: "published" } },
      { $group: { _id: "$incidentId", count: { $sum: 1 } } },
    ]),
    actorId
      ? VoteModel.find({ incidentId: { $in: ids }, actorId })
          .select("incidentId type")
          .lean()
      : [],
    actorId
      ? ReportModel.find({ targetType: "incident", targetId: { $in: ids }, actorId })
          .select("targetId")
          .lean()
      : [],
  ]);

  const counts = new Map<string, Counts>(ids.map((id) => [String(id), emptyCounts()]));
  for (const row of voteCounts as any[]) {
    const item = counts.get(String(row._id.incidentId));
    if (item && row._id.type === "support") item.support = row.count;
    if (item && row._id.type === "dispute") item.dispute = row.count;
  }
  for (const row of flagCounts as any[]) {
    const item = counts.get(String(row._id));
    if (item) item.flags = row.count;
  }
  for (const row of commentCounts as any[]) {
    const item = counts.get(String(row._id));
    if (item) item.comments = row.count;
  }
  const votes = new Map((viewerVotes as any[]).map((row) => [String(row.incidentId), row.type]));
  const flags = new Set((viewerFlags as any[]).map((row) => String(row.targetId)));
  return objects.map((object) => {
    const id = String(object._id);
    return publicIncident(
      object,
      counts.get(id) ?? emptyCounts(),
      votes.get(id) ?? null,
      flags.has(id),
    );
  });
}

export async function requirePublishedIncident(trackingId: string) {
  const incident = await IncidentModel.findOne({ trackingId, status: "published" });
  return incident;
}
