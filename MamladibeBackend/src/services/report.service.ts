import { AppError } from "../lib/app-error.js";
import { CommentModel, ReportModel } from "../models/index.js";
import { requirePublishedIncident } from "./incident.mapper.js";

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

function publicReport(report: any) {
  return {
    id: `flag_${report._id.toString()}`,
    targetType: report.targetType,
    reason: report.reason,
    reviewStatus: report.reviewStatus,
    createdAt: new Date(report.createdAt).toISOString(),
  };
}

export class ReportService {
  async incident(trackingId: string, actorId: string, reason: string) {
    const incident = await requirePublishedIncident(trackingId);
    if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
    try {
      const report = await ReportModel.create({
        targetType: "incident",
        targetId: incident._id,
        actorId,
        reason,
      });
      const flagCount = await ReportModel.countDocuments({
        targetType: "incident",
        targetId: incident._id,
      });
      return { report: publicReport(report), flagCount };
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(
          "DUPLICATE_FLAG",
          "This incident has already been flagged by this browser.",
        );
      }
      throw error;
    }
  }

  async comment(commentId: string, actorId: string, reason: string) {
    const comment = await CommentModel.findOne({ _id: commentId, status: "published" });
    if (!comment) throw new AppError("NOT_FOUND", "Comment not found.");
    try {
      const report = await ReportModel.create({
        targetType: "comment",
        targetId: comment._id,
        actorId,
        reason,
      });
      const flagCount = await ReportModel.countDocuments({
        targetType: "comment",
        targetId: comment._id,
      });
      return { report: publicReport(report), flagCount };
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(
          "DUPLICATE_FLAG",
          "This comment has already been flagged by this browser.",
        );
      }
      throw error;
    }
  }
}
