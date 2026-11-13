import mongoose, { type FilterQuery } from "mongoose";

import { AppError } from "../lib/app-error.js";
import { contentHash, generateTrackingId, randomToken } from "../lib/crypto.js";
import { isInBangladesh } from "../lib/constants.js";
import { hashOpaqueToken } from "../lib/admin-security.js";
import {
  ActorModel,
  AdminSessionModel,
  AdminUserModel,
  AuditLogModel,
  BlockModel,
  CommentModel,
  IncidentModel,
  IncidentVersionModel,
  ReportModel,
  VoteModel,
} from "../models/index.js";
import { communityCounts } from "./incident.mapper.js";
import { writeAudit, type AuditAction, type AuditTarget } from "./audit.service.js";

type AdminContext = { id: string; role: "moderator" | "super_admin" };

function pagination(page: number, pageSize: number, totalItems: number) {
  return { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function anonymousId(actorId?: string) {
  return actorId ? `anon_${actorId.slice(0, 16)}` : undefined;
}
function adminDto(value: any) {
  const item = typeof value.toObject === "function" ? value.toObject() : value;
  return {
    id: String(item._id),
    email: item.email,
    role: item.role,
    active: item.active,
    failedLogins: item.failedLogins,
    ...(item.lockedUntil ? { lockedUntil: item.lockedUntil } : {}),
    ...(item.lastLoginAt ? { lastLoginAt: item.lastLoginAt } : {}),
    ...(item.enrolledAt ? { enrolledAt: item.enrolledAt } : {}),
    ...(item.enrollmentExpiresAt ? { enrollmentExpiresAt: item.enrollmentExpiresAt } : {}),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
function blockDto(value: any) {
  const item = typeof value.toObject === "function" ? value.toObject() : value;
  return {
    id: String(item._id),
    targetType: item.targetType,
    targetRef: item.targetType === "anonymous_id" ? anonymousId(item.targetHash) : item.targetHash,
    mode: item.mode,
    reason: item.reason,
    active: item.active,
    expiresAt: item.expiresAt,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    removedBy: item.removedBy,
    removedAt: item.removedAt,
  };
}
async function resolveActorId(value: string) {
  const prefix = value.startsWith("anon_") ? value.slice(5) : value;
  if (!/^[a-f\d]{8,64}$/i.test(prefix)) return null;
  const actor: any = await ActorModel.findOne({
    actorId: new RegExp(`^${escapeRegex(prefix)}`),
  }).lean();
  return actor?.actorId ?? null;
}
async function withTransaction<T>(work: (session: mongoose.ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
async function auditChange(
  session: mongoose.ClientSession,
  admin: AdminContext,
  action: AuditAction,
  targetType: AuditTarget,
  targetId: string,
  reason: string,
  before?: unknown,
  after?: unknown,
) {
  await writeAudit(
    { adminId: admin.id, action, targetType, targetId, reason, before, after },
    session,
  );
}

async function incidentDto(document: any) {
  const object = typeof document.toObject === "function" ? document.toObject() : document;
  const counts = await communityCounts(object._id);
  const [lng, lat] = object.location.coordinates;
  return {
    trackingId: object.trackingId,
    title: object.title,
    description: object.description,
    category: object.category,
    lat,
    lng,
    roadName: object.roadName ?? "",
    areaName: object.areaName,
    incidentAt: new Date(object.incidentAt).toISOString(),
    createdAt: new Date(object.createdAt).toISOString(),
    ...(object.safetyTip ? { safetyTip: object.safetyTip } : {}),
    status: object.status,
    source: object.source,
    ...(object.adminLabel ? { adminLabel: object.adminLabel } : {}),
    ...(anonymousId(object.actorId) ? { anonymousId: anonymousId(object.actorId) } : {}),
    support: counts.support,
    dispute: counts.dispute,
    flags: counts.flags,
    commentCount: counts.comments,
    isEdited: object.isEdited,
    byModerator: object.byModerator,
    ...(object.editedAt ? { editedAt: new Date(object.editedAt).toISOString() } : {}),
    ...(object.hiddenAt ? { hiddenAt: new Date(object.hiddenAt).toISOString() } : {}),
    ...(object.deletedAt ? { deletedAt: new Date(object.deletedAt).toISOString() } : {}),
  };
}

const transitions = {
  hide: { from: ["published"], to: "hidden", audit: "hide" },
  unhide: { from: ["hidden"], to: "published", audit: "unhide" },
  soft_delete: { from: ["published", "hidden"], to: "deleted", audit: "delete" },
  restore: { from: ["deleted"], to: "hidden", audit: "restore" },
} as const;

export class AdminModerationService {
  async dashboard() {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setTime(start.getTime() - 6 * 60 * 60 * 1_000);
    const [
      incidents,
      comments,
      votes,
      openFlags,
      todayIncidents,
      todayComments,
      todayVotes,
      todayFlags,
      incidentFlags,
      commentFlags,
      hiddenIncidents,
      hiddenComments,
    ] = await Promise.all([
      IncidentModel.countDocuments(),
      CommentModel.countDocuments(),
      VoteModel.countDocuments(),
      ReportModel.countDocuments({ reviewStatus: "pending" }),
      IncidentModel.countDocuments({ createdAt: { $gte: start } }),
      CommentModel.countDocuments({ createdAt: { $gte: start } }),
      VoteModel.countDocuments({ createdAt: { $gte: start } }),
      ReportModel.countDocuments({ createdAt: { $gte: start } }),
      ReportModel.countDocuments({ reviewStatus: "pending", targetType: "incident" }),
      ReportModel.countDocuments({ reviewStatus: "pending", targetType: "comment" }),
      IncidentModel.countDocuments({ status: "hidden" }),
      CommentModel.countDocuments({ status: "hidden" }),
    ]);
    return {
      totals: { incidents, comments, votes, openFlags },
      today: {
        incidents: todayIncidents,
        comments: todayComments,
        votes: todayVotes,
        flags: todayFlags,
      },
      waitingForReview: { incidentFlags, commentFlags, hiddenIncidents, hiddenComments },
    };
  }

  async listIncidents(input: any) {
    const filter: FilterQuery<any> = {};
    if (input.status) filter.status = input.status;
    if (input.category) filter.category = input.category;
    if (input.source) filter.source = input.source;
    if (input.trackingId) filter.trackingId = input.trackingId.toUpperCase();
    if (input.q) {
      const q = new RegExp(escapeRegex(input.q), "i");
      filter.$or = [{ title: q }, { areaName: q }, { roadName: q }];
    }
    if (input.from || input.to)
      filter.createdAt = {
        ...(input.from ? { $gte: new Date(input.from) } : {}),
        ...(input.to ? { $lte: new Date(input.to) } : {}),
      };
    if (input.anonymousId) {
      const id = await resolveActorId(input.anonymousId);
      filter.actorId = id ?? "__missing__";
    }
    if (input.flagged === "true") {
      const ids = await ReportModel.distinct("targetId", { targetType: "incident" });
      filter._id = { $in: ids };
    }
    if (input.flagged === "false") {
      const ids = await ReportModel.distinct("targetId", { targetType: "incident" });
      filter._id = { $nin: ids };
    }
    const [docs, total] = await Promise.all([
      IncidentModel.find(filter)
        .select("+actorId")
        .sort({ createdAt: input.sort === "oldest" ? 1 : -1 })
        .skip((input.page - 1) * input.pageSize)
        .limit(input.pageSize),
      IncidentModel.countDocuments(filter),
    ]);
    return {
      items: await Promise.all(docs.map(incidentDto)),
      pagination: pagination(input.page, input.pageSize, total),
    };
  }

  async getIncident(trackingId: string) {
    const incident = await IncidentModel.findOne({ trackingId: trackingId.toUpperCase() }).select(
      "+actorId",
    );
    if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
    const [versions, comments, flags, history] = await Promise.all([
      IncidentVersionModel.find({ incidentId: incident._id }).sort({ version: -1 }).lean(),
      CommentModel.find({ incidentId: incident._id })
        .select("+actorId")
        .sort({ createdAt: -1 })
        .lean(),
      ReportModel.find({ targetType: "incident", targetId: incident._id })
        .select("+actorId")
        .sort({ createdAt: -1 })
        .lean(),
      AuditLogModel.find({ targetType: "incident", targetId: incident.trackingId })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    return {
      incident: await incidentDto(incident),
      versions,
      comments: comments.map((item: any) => ({
        ...item,
        actorId: undefined,
        anonymousId: anonymousId(item.actorId),
      })),
      flags: flags.map((item: any) => ({
        ...item,
        actorId: undefined,
        anonymousId: anonymousId(item.actorId),
      })),
      moderationHistory: history,
    };
  }

  async createIncident(input: any, admin: AdminContext) {
    if (!isInBangladesh(input.lat, input.lng))
      throw new AppError("OUTSIDE_BANGLADESH", "Coordinates must be inside Bangladesh.");
    if (new Date(input.incidentAt).getTime() > Date.now())
      throw new AppError("FUTURE_INCIDENT_TIME", "Incident time cannot be in the future.");
    return withTransaction(async (session) => {
      const [created] = await IncidentModel.create(
        [
          {
            trackingId: generateTrackingId(),
            title: input.title,
            description: input.description,
            category: input.category,
            incidentAt: new Date(input.incidentAt),
            location: { type: "Point", coordinates: [input.lng, input.lat] },
            roadName: input.roadName,
            areaName: input.areaName,
            safetyTip: input.safetyTip,
            source: "admin",
            adminLabel: input.adminLabel,
            contentHash: contentHash(
              `${input.title}|${input.description}|${input.incidentAt}|${input.lat}|${input.lng}`,
            ),
            byModerator: true,
          },
        ],
        { session },
      );
      await auditChange(
        session,
        admin,
        "incident.create",
        "incident",
        created.trackingId,
        input.reason,
        undefined,
        { status: created.status, source: "admin", adminLabel: input.adminLabel },
      );
      return { incident: await incidentDto(created) };
    });
  }

  async moderateIncident(trackingId: string, input: any, admin: AdminContext) {
    return withTransaction(async (session) => {
      const incident = await IncidentModel.findOne({
        trackingId: trackingId.toUpperCase(),
      }).session(session);
      if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
      const rule = transitions[input.action as keyof typeof transitions];
      if (!(rule.from as readonly string[]).includes(incident.status))
        throw new AppError("CONFLICT", "Invalid incident status transition.");
      const before = { status: incident.status };
      incident.status = rule.to;
      if (rule.to === "hidden") incident.hiddenAt = new Date();
      if (rule.to === "deleted") {
        incident.deletedAt = new Date();
        incident.purgeAt = new Date(Date.now() + 30 * 86_400_000);
      }
      if (rule.to !== "deleted") {
        incident.deletedAt = undefined;
        incident.purgeAt = undefined;
      }
      if (rule.to === "published") incident.hiddenAt = undefined;
      await incident.save({ session });
      await auditChange(
        session,
        admin,
        `incident.${rule.audit}` as AuditAction,
        "incident",
        incident.trackingId,
        input.reason,
        before,
        { status: incident.status },
      );
      return { incident: await incidentDto(incident) };
    });
  }

  async redactIncident(trackingId: string, input: any, admin: AdminContext) {
    return withTransaction(async (session) => {
      const incident = await IncidentModel.findOne({
        trackingId: trackingId.toUpperCase(),
      }).session(session);
      if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
      const version =
        (await IncidentVersionModel.countDocuments({ incidentId: incident._id }).session(session)) +
        1;
      await IncidentVersionModel.create(
        [
          {
            incidentId: incident._id,
            version,
            title: incident.title,
            description: incident.description,
            safetyTip: incident.safetyTip,
            savedAt: new Date(),
            editedBy: "moderator",
            adminId: admin.id,
            reason: input.reason,
          },
        ],
        { session },
      );
      if (input.title !== undefined) incident.title = input.title;
      if (input.description !== undefined) incident.description = input.description;
      if (input.safetyTip !== undefined) incident.safetyTip = input.safetyTip ?? undefined;
      incident.isEdited = true;
      incident.editedAt = new Date();
      incident.byModerator = true;
      await incident.save({ session });
      await auditChange(
        session,
        admin,
        "incident.redact",
        "incident",
        incident.trackingId,
        input.reason,
        { version },
        { changedFields: Object.keys(input).filter((key) => key !== "reason") },
      );
      return { incident: await incidentDto(incident) };
    });
  }

  async purgeIncident(trackingId: string, reason: string, admin: AdminContext) {
    return withTransaction(async (session) => {
      const incident = await IncidentModel.findOne({
        trackingId: trackingId.toUpperCase(),
      }).session(session);
      if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
      const commentIds = await CommentModel.find({ incidentId: incident._id })
        .distinct("_id")
        .session(session);
      await Promise.all([
        IncidentVersionModel.deleteMany({ incidentId: incident._id }).session(session),
        VoteModel.deleteMany({ incidentId: incident._id }).session(session),
        ReportModel.deleteMany({
          $or: [
            { targetType: "incident", targetId: incident._id },
            { targetType: "comment", targetId: { $in: commentIds } },
          ],
        }).session(session),
        CommentModel.deleteMany({ incidentId: incident._id }).session(session),
      ]);
      await IncidentModel.deleteOne({ _id: incident._id }).session(session);
      await auditChange(
        session,
        admin,
        "incident.purge",
        "incident",
        incident.trackingId,
        reason,
        { status: incident.status, category: incident.category },
        { purged: true },
      );
    });
  }

  async listComments(input: any) {
    const filter: FilterQuery<any> = {};
    if (input.q) filter.text = new RegExp(escapeRegex(input.q), "i");
    if (input.status) filter.status = input.status;
    if (input.type) filter.type = input.type;
    if (input.from || input.to)
      filter.createdAt = {
        ...(input.from ? { $gte: new Date(input.from) } : {}),
        ...(input.to ? { $lte: new Date(input.to) } : {}),
      };
    if (input.incidentTrackingId) {
      const incident: any = await IncidentModel.findOne({
        trackingId: input.incidentTrackingId.toUpperCase(),
      })
        .select("_id")
        .lean();
      filter.incidentId = incident?._id ?? new mongoose.Types.ObjectId();
    }
    if (input.anonymousId) {
      const id = await resolveActorId(input.anonymousId);
      filter.actorId = id ?? "__missing__";
    }
    if (input.flagged) {
      const ids = await ReportModel.distinct("targetId", { targetType: "comment" });
      filter._id = input.flagged === "true" ? { $in: ids } : { $nin: ids };
    }
    const [docs, total] = await Promise.all([
      CommentModel.find(filter)
        .select("+actorId")
        .sort({ createdAt: input.sort === "oldest" ? 1 : -1 })
        .skip((input.page - 1) * input.pageSize)
        .limit(input.pageSize)
        .lean(),
      CommentModel.countDocuments(filter),
    ]);
    return {
      items: docs.map((item: any) => ({
        ...item,
        actorId: undefined,
        anonymousId: anonymousId(item.actorId),
      })),
      pagination: pagination(input.page, input.pageSize, total),
    };
  }

  async getComment(id: string) {
    const comment: any = await CommentModel.findById(id).select("+actorId").lean();
    if (!comment) throw new AppError("NOT_FOUND", "Comment not found.");
    const flags = await ReportModel.find({ targetType: "comment", targetId: comment._id })
      .select("+actorId")
      .lean();
    return {
      comment: { ...comment, actorId: undefined, anonymousId: anonymousId(comment.actorId) },
      flags: flags.map((item: any) => ({
        ...item,
        actorId: undefined,
        anonymousId: anonymousId(item.actorId),
      })),
    };
  }

  async moderateComment(id: string, input: any, admin: AdminContext) {
    return withTransaction(async (session) => {
      const comment = await CommentModel.findById(id).session(session);
      if (!comment) throw new AppError("NOT_FOUND", "Comment not found.");
      const rule = transitions[input.action as keyof typeof transitions];
      if (!(rule.from as readonly string[]).includes(comment.status))
        throw new AppError("CONFLICT", "Invalid comment status transition.");
      const before = { status: comment.status };
      comment.status = rule.to;
      if (rule.to === "hidden") comment.hiddenAt = new Date();
      if (rule.to === "deleted") {
        comment.deletedAt = new Date();
        comment.purgeAt = new Date(Date.now() + 30 * 86_400_000);
      }
      if (rule.to !== "deleted") {
        comment.deletedAt = undefined;
        comment.purgeAt = undefined;
      }
      if (rule.to === "published") comment.hiddenAt = undefined;
      await comment.save({ session });
      await auditChange(
        session,
        admin,
        `comment.${rule.audit}` as AuditAction,
        "comment",
        comment.id,
        input.reason,
        before,
        { status: comment.status },
      );
      return { comment };
    });
  }

  async purgeComment(id: string, reason: string, admin: AdminContext) {
    return withTransaction(async (session) => {
      const comment = await CommentModel.findById(id).session(session);
      if (!comment) throw new AppError("NOT_FOUND", "Comment not found.");
      await ReportModel.deleteMany({ targetType: "comment", targetId: comment._id }).session(
        session,
      );
      await CommentModel.deleteOne({ _id: comment._id }).session(session);
      await auditChange(
        session,
        admin,
        "comment.purge",
        "comment",
        comment.id,
        reason,
        { status: comment.status },
        { purged: true },
      );
    });
  }

  async listFlags(input: any) {
    const filter: FilterQuery<any> = {};
    if (input.reviewStatus) filter.reviewStatus = input.reviewStatus;
    if (input.targetType) filter.targetType = input.targetType;
    if (input.reason) filter.reason = input.reason;
    if (input.from || input.to)
      filter.createdAt = {
        ...(input.from ? { $gte: new Date(input.from) } : {}),
        ...(input.to ? { $lte: new Date(input.to) } : {}),
      };
    if (input.trackingId) {
      const incident: any = await IncidentModel.findOne({
        trackingId: input.trackingId.toUpperCase(),
      })
        .select("_id")
        .lean();
      filter.targetId = incident?._id ?? new mongoose.Types.ObjectId();
    }
    const [docs, total] = await Promise.all([
      ReportModel.find(filter)
        .select("+actorId")
        .sort({ createdAt: input.reviewStatus === "pending" ? 1 : -1 })
        .skip((input.page - 1) * input.pageSize)
        .limit(input.pageSize)
        .lean(),
      ReportModel.countDocuments(filter),
    ]);
    return {
      items: docs.map((item: any) => ({
        ...item,
        actorId: undefined,
        anonymousId: anonymousId(item.actorId),
      })),
      pagination: pagination(input.page, input.pageSize, total),
    };
  }
  async getFlag(id: string) {
    const flag: any = await ReportModel.findById(id).select("+actorId").lean();
    if (!flag) throw new AppError("NOT_FOUND", "Flag not found.");
    return { flag: { ...flag, actorId: undefined, anonymousId: anonymousId(flag.actorId) } };
  }
  async reviewFlag(id: string, input: any, admin: AdminContext) {
    return withTransaction(async (session) => {
      const flag = await ReportModel.findById(id).session(session);
      if (!flag) throw new AppError("NOT_FOUND", "Flag not found.");
      if (flag.reviewStatus === "reviewed")
        throw new AppError("CONFLICT", "Flag has already been reviewed.");
      const target: any =
        flag.targetType === "incident"
          ? await IncidentModel.findById(flag.targetId).session(session)
          : await CommentModel.findById(flag.targetId).session(session);
      const before = { reviewStatus: flag.reviewStatus, targetStatus: target?.status };
      if (target && input.outcome === "hidden") {
        target.status = "hidden";
        target.hiddenAt = new Date();
        await target.save({ session });
      }
      if (target && input.outcome === "removed") {
        target.status = "deleted";
        target.deletedAt = new Date();
        target.purgeAt = new Date(Date.now() + 30 * 86_400_000);
        await target.save({ session });
      }
      flag.reviewStatus = "reviewed";
      flag.outcome = input.outcome;
      flag.note = input.note;
      flag.reviewedBy = admin.id;
      flag.reviewedAt = new Date();
      await flag.save({ session });
      await auditChange(session, admin, "flag.review", "flag", flag.id, input.reason, before, {
        outcome: input.outcome,
        targetStatus: target?.status,
      });
      return { flag };
    });
  }

  async activity(query: any, reason: string, admin: AdminContext) {
    let actorId: string | null = null;
    if (query.trackingId) {
      const source: any = await IncidentModel.findOne({
        trackingId: query.trackingId.toUpperCase(),
      })
        .select("+actorId")
        .lean();
      actorId = source?.actorId ?? null;
    } else actorId = await resolveActorId(query.anonymousId);
    if (!actorId) throw new AppError("NOT_FOUND", "Anonymous activity not found.");
    const actor: any = await ActorModel.findOne({ actorId }).lean();
    if (!actor) throw new AppError("NOT_FOUND", "Anonymous activity not found.");
    const [incidents, comments, votes, flags] = await Promise.all([
      IncidentModel.find({ actorId }).lean(),
      CommentModel.find({ actorId }).lean(),
      VoteModel.find({ actorId }).lean(),
      ReportModel.find({ actorId }).lean(),
    ]);
    const timeline = [
      ...incidents.map((x: any) => ({ type: "incident", id: x.trackingId, at: x.createdAt })),
      ...comments.map((x: any) => ({ type: "comment", id: x._id, at: x.createdAt })),
      ...votes.map((x: any) => ({ type: "vote", id: x._id, at: x.createdAt })),
      ...flags.map((x: any) => ({ type: "flag", id: x._id, at: x.createdAt })),
    ].sort((a: any, b: any) => +new Date(a.at) - +new Date(b.at));
    await writeAudit({
      adminId: admin.id,
      action: "activity.view",
      targetType: "actor",
      targetId: anonymousId(actorId)!,
      reason,
    });
    return {
      actor: {
        anonymousId: anonymousId(actorId),
        firstSeenAt: actor.firstSeenAt,
        lastSeenAt: actor.lastSeenAt,
      },
      timeline,
    };
  }
  async actorNotes(alias: string) {
    const id = await resolveActorId(alias);
    const actor: any = id
      ? await ActorModel.findOne({ actorId: id }).populate("notes.adminId", "email role").lean()
      : null;
    if (!actor) throw new AppError("NOT_FOUND", "Anonymous actor not found.");
    return { items: actor.notes ?? [] };
  }
  async addActorNote(alias: string, input: any, admin: AdminContext) {
    const id = await resolveActorId(alias);
    if (!id) throw new AppError("NOT_FOUND", "Anonymous actor not found.");
    return withTransaction(async (session) => {
      const note = { adminId: admin.id, text: input.text, createdAt: new Date() };
      const actor = await ActorModel.findOneAndUpdate(
        { actorId: id },
        { $push: { notes: note } },
        { new: true, session },
      );
      if (!actor) throw new AppError("NOT_FOUND", "Anonymous actor not found.");
      await auditChange(session, admin, "actor.note", "actor", alias, input.reason, undefined, {
        noteAdded: true,
      });
      return { item: actor.notes.at(-1) };
    });
  }

  async bulk(input: any, admin: AdminContext) {
    return withTransaction(async (session) => {
      let changed = 0;
      if (input.targetType === "vote" && input.action === "remove")
        changed = (await VoteModel.deleteMany({ _id: { $in: input.targetIds } }).session(session))
          .deletedCount;
      else if (input.targetType === "comment" && ["hide", "soft_delete"].includes(input.action)) {
        const status = input.action === "hide" ? "hidden" : "deleted";
        changed = (
          await CommentModel.updateMany(
            { _id: { $in: input.targetIds }, status: { $ne: status } },
            {
              $set: {
                status,
                ...(status === "hidden"
                  ? { hiddenAt: new Date() }
                  : { deletedAt: new Date(), purgeAt: new Date(Date.now() + 30 * 86_400_000) }),
              },
            },
            { session },
          )
        ).modifiedCount;
      } else if (input.targetType === "flag" && input.action === "invalidate")
        changed = (
          await ReportModel.updateMany(
            { _id: { $in: input.targetIds }, reviewStatus: "pending" },
            {
              $set: {
                reviewStatus: "reviewed",
                outcome: "removed",
                reviewedBy: admin.id,
                reviewedAt: new Date(),
              },
            },
            { session },
          )
        ).modifiedCount;
      else throw new AppError("VALIDATION_ERROR", "Unsupported bulk action combination.");
      await auditChange(
        session,
        admin,
        "bulk.remove",
        input.targetType,
        "bulk",
        input.reason,
        undefined,
        { targetIds: input.targetIds, changed },
      );
      return {
        requested: input.targetIds.length,
        changed,
        unchanged: input.targetIds.length - changed,
      };
    });
  }

  async listBlocks() {
    const items = await BlockModel.find().select("+targetHash").sort({ createdAt: -1 }).lean();
    return { items: items.map(blockDto) };
  }
  async createBlock(input: any, admin: AdminContext) {
    return withTransaction(async (session) => {
      const targetHash =
        input.targetType === "anonymous_id"
          ? await resolveActorId(input.targetRef)
          : input.targetRef;
      if (!targetHash) throw new AppError("NOT_FOUND", "Block target not found.");
      const [block] = await BlockModel.create(
        [
          {
            targetType: input.targetType,
            targetHash,
            mode: input.mode,
            reason: input.reason,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
            active: true,
            createdBy: admin.id,
          },
        ],
        { session },
      );
      await auditChange(
        session,
        admin,
        "block.create",
        "block",
        block.id,
        input.reason,
        undefined,
        { targetType: input.targetType, mode: input.mode, expiresAt: block.expiresAt },
      );
      return { item: blockDto(block) };
    });
  }
  async removeBlock(id: string, reason: string, admin: AdminContext) {
    return withTransaction(async (session) => {
      const block = await BlockModel.findOneAndUpdate(
        { _id: id, active: true },
        { $set: { active: false, removedBy: admin.id, removedAt: new Date() } },
        { new: true, session },
      );
      if (!block) throw new AppError("NOT_FOUND", "Active block not found.");
      await auditChange(
        session,
        admin,
        "block.remove",
        "block",
        block.id,
        reason,
        { active: true },
        { active: false },
      );
    });
  }

  async listAdmins() {
    const items = await AdminUserModel.find().sort({ createdAt: -1 }).lean();
    return { items: items.map(adminDto) };
  }
  async getAdmin(id: string) {
    const item = await AdminUserModel.findById(id).lean();
    if (!item) throw new AppError("NOT_FOUND", "Administrator not found.");
    return { item: adminDto(item) };
  }
  async createAdmin(input: any, admin: AdminContext) {
    const token = randomToken(32);
    const item = await withTransaction(async (session) => {
      const [created] = await AdminUserModel.create(
        [
          {
            email: input.email,
            role: input.role,
            active: false,
            enrollmentTokenHash: hashOpaqueToken(token),
            enrollmentExpiresAt: new Date(Date.now() + 86_400_000),
          },
        ],
        { session },
      );
      await auditChange(
        session,
        admin,
        "admin.create",
        "admin",
        created.id,
        input.reason,
        undefined,
        { email: created.email, role: created.role, active: false },
      );
      return created;
    });
    return {
      item: adminDto(item),
      enrollmentToken: token,
      enrollmentExpiresAt: item.enrollmentExpiresAt,
    };
  }
  async updateAdmin(id: string, input: any, admin: AdminContext) {
    return withTransaction(async (session) => {
      const target = await AdminUserModel.findById(id).session(session);
      if (!target) throw new AppError("NOT_FOUND", "Administrator not found.");
      if (
        id === admin.id &&
        (input.active === false || (input.role && input.role !== "super_admin"))
      )
        throw new AppError("CONFLICT", "A Super Admin cannot deactivate or demote themself.");
      if (
        target.role === "super_admin" &&
        target.active &&
        (input.active === false || input.role === "moderator")
      ) {
        const count = await AdminUserModel.countDocuments({
          role: "super_admin",
          active: true,
        }).session(session);
        if (count <= 1)
          throw new AppError(
            "CONFLICT",
            "The final active Super Admin cannot be disabled or demoted.",
          );
      }
      const before = { role: target.role, active: target.active };
      if (input.role) target.role = input.role;
      if (input.active !== undefined) target.active = input.active;
      await target.save({ session });
      if (input.active === false)
        await AdminSessionModel.deleteMany({ adminId: target._id }).session(session);
      await auditChange(session, admin, "admin.update", "admin", target.id, input.reason, before, {
        role: target.role,
        active: target.active,
      });
      return { item: adminDto(target) };
    });
  }
  async reset2fa(id: string, reason: string, admin: AdminContext) {
    const token = randomToken(32);
    const item = await withTransaction(async (session) => {
      const target = await AdminUserModel.findById(id).session(session);
      if (!target) throw new AppError("NOT_FOUND", "Administrator not found.");
      target.active = false;
      target.passwordHash = undefined;
      target.totpSecretEncrypted = undefined;
      target.enrollmentTokenHash = hashOpaqueToken(token);
      target.enrollmentExpiresAt = new Date(Date.now() + 86_400_000);
      await target.save({ session });
      await AdminSessionModel.deleteMany({ adminId: target._id }).session(session);
      await auditChange(session, admin, "admin.reset_2fa", "admin", target.id, reason, undefined, {
        active: false,
        enrollmentExpiresAt: target.enrollmentExpiresAt,
      });
      return target;
    });
    return {
      item: adminDto(item),
      enrollmentToken: token,
      enrollmentExpiresAt: item.enrollmentExpiresAt,
    };
  }
  async audit(input: any, admin: AdminContext) {
    const filter: any = {};
    if (admin.role !== "super_admin") filter.adminId = admin.id;
    else if (input.adminId) filter.adminId = input.adminId;
    if (input.action) filter.action = input.action;
    if (input.targetType) filter.targetType = input.targetType;
    if (input.targetId) filter.targetId = input.targetId;
    if (input.from || input.to)
      filter.createdAt = {
        ...(input.from ? { $gte: new Date(input.from) } : {}),
        ...(input.to ? { $lte: new Date(input.to) } : {}),
      };
    const [items, total] = await Promise.all([
      AuditLogModel.find(filter)
        .populate("adminId", "email role")
        .sort({ createdAt: input.sort === "oldest" ? 1 : -1 })
        .skip((input.page - 1) * input.pageSize)
        .limit(input.pageSize)
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);
    return { items, pagination: pagination(input.page, input.pageSize, total) };
  }
}
