import { AppError } from "../lib/app-error.js";
import { hasLink } from "../lib/text.js";
import { CommentModel, ReportModel } from "../models/index.js";
import type { CaptchaService } from "./captcha.service.js";
import type { CommentQuotaStore } from "./quota.service.js";
import { requirePublishedIncident } from "./incident.mapper.js";

interface CreateCommentInput {
  type: "correction" | "extra" | "opinion";
  text: string;
  captchaToken: string;
}

export class CommentService {
  constructor(
    private readonly quota: CommentQuotaStore,
    private readonly captcha: CaptchaService,
  ) {}

  private async toPublicComment(comment: any, trackingId: string, actorId?: string) {
    const object = typeof comment.toObject === "function" ? comment.toObject() : comment;
    const mine = Boolean(actorId && object.actorId === actorId);
    const hasFlagged = actorId
      ? Boolean(await ReportModel.exists({ targetType: "comment", targetId: object._id, actorId }))
      : false;
    return {
      id: object._id.toString(),
      trackingId,
      type: object.type,
      text: object.text,
      createdAt: new Date(object.createdAt).toISOString(),
      mine,
      canDelete: mine,
      hasFlagged,
    };
  }

  async list(trackingId: string, actorId: string | undefined, page = 1, pageSize = 10) {
    const incident = await requirePublishedIncident(trackingId);
    if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
    const filter = { incidentId: incident._id, status: "published" };
    const [comments, totalItems] = await Promise.all([
      CommentModel.find(filter)
        .select("+actorId")
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      CommentModel.countDocuments(filter),
    ]);
    return {
      items: await Promise.all(
        comments.map((comment) => this.toPublicComment(comment, trackingId, actorId)),
      ),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  }

  async create(
    trackingId: string,
    actorId: string,
    networkHash: string,
    input: CreateCommentInput,
    remoteIp?: string,
  ) {
    const incident = await requirePublishedIncident(trackingId);
    if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
    if (hasLink(input.text)) {
      throw new AppError("VALIDATION_ERROR", "One or more fields are invalid.", {
        fieldErrors: { text: "Links are not allowed in comments." },
      });
    }
    await this.captcha.verify(input.captchaToken, remoteIp);

    const actorReservation = await this.quota.reserve(actorId);
    if (!actorReservation.allowed) {
      throw new AppError("COMMENT_LIMIT_EXCEEDED", "The five-comment limit has been reached.", {
        details: {
          limit: actorReservation.limit,
          resetsAt: actorReservation.resetsAt.toISOString(),
        },
      });
    }

    const networkSubject = `network:${networkHash}`;
    const networkReservation = await this.quota.reserve(networkSubject);
    if (!networkReservation.allowed) {
      await this.quota.release(actorId, actorReservation.member);
      throw new AppError("COMMENT_LIMIT_EXCEEDED", "The five-comment limit has been reached.", {
        details: {
          limit: networkReservation.limit,
          resetsAt: networkReservation.resetsAt.toISOString(),
        },
      });
    }
    try {
      const comment = await CommentModel.create({
        incidentId: incident._id,
        actorId,
        type: input.type,
        text: input.text,
      });
      return {
        comment: await this.toPublicComment(
          { ...comment.toObject(), actorId },
          trackingId,
          actorId,
        ),
        quota: {
          limit: actorReservation.limit,
          used: Math.max(actorReservation.used, networkReservation.used),
          remaining: Math.min(actorReservation.remaining, networkReservation.remaining),
          resetsAt: new Date(
            Math.max(actorReservation.resetsAt.getTime(), networkReservation.resetsAt.getTime()),
          ).toISOString(),
        },
      };
    } catch (error) {
      await Promise.all([
        this.quota.release(actorId, actorReservation.member),
        this.quota.release(networkSubject, networkReservation.member),
      ]);
      throw error;
    }
  }

  async remove(commentId: string, actorId: string) {
    const comment = await CommentModel.findOne({ _id: commentId, status: "published" }).select(
      "+actorId",
    );
    if (!comment) throw new AppError("NOT_FOUND", "Comment not found.");
    if (comment.actorId !== actorId) {
      throw new AppError("FORBIDDEN", "Only the original browser can delete this comment.");
    }
    comment.status = "deleted";
    comment.deletedAt = new Date();
    await comment.save();
  }
}
