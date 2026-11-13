import { type FilterQuery } from "mongoose";

import type { AppConfig } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import {
  contentHash,
  generateReporterSecret,
  generateTrackingId,
  hashReporterSecret,
} from "../lib/crypto.js";
import { isInBangladesh, RULES } from "../lib/constants.js";
import { IncidentModel } from "../models/index.js";
import type { CaptchaService } from "./captcha.service.js";
import { requirePublishedIncident, toPublicIncident } from "./incident.mapper.js";

interface CreateIncidentInput {
  title: string;
  description: string;
  category: string;
  incidentAt: string;
  lat: number;
  lng: number;
  roadName: string;
  areaName: string;
  safetyTip?: string | undefined;
  captchaToken: string;
}

interface ListIncidentInput {
  q?: string | undefined;
  category?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  sort?: "newest" | "oldest" | undefined;
  minLat?: number | undefined;
  minLng?: number | undefined;
  maxLat?: number | undefined;
  maxLng?: number | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  radiusKm?: number | undefined;
}

function normalizedIncidentHash(input: CreateIncidentInput) {
  return contentHash(
    [
      input.title.toLowerCase(),
      input.description.toLowerCase(),
      input.category,
      new Date(input.incidentAt).toISOString(),
      input.lat.toFixed(5),
      input.lng.toFixed(5),
    ].join("|"),
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class IncidentService {
  constructor(
    private readonly config: AppConfig,
    private readonly captcha: CaptchaService,
  ) {}

  async create(input: CreateIncidentInput, actorId: string, remoteIp?: string) {
    await this.captcha.verify(input.captchaToken, remoteIp);
    if (!isInBangladesh(input.lat, input.lng)) {
      throw new AppError("OUTSIDE_BANGLADESH", "Coordinates must be inside Bangladesh.");
    }
    const incidentAt = new Date(input.incidentAt);
    if (incidentAt.getTime() > Date.now()) {
      throw new AppError("FUTURE_INCIDENT_TIME", "Incident time cannot be in the future.");
    }

    const hash = normalizedIncidentHash(input);
    if (await IncidentModel.exists({ contentHash: hash, status: { $ne: "deleted" } })) {
      throw new AppError(
        "DUPLICATE_INCIDENT",
        "This incident appears to have already been submitted.",
      );
    }

    const secret = generateReporterSecret();
    const secretHash = await hashReporterSecret(secret, this.config.REPORTER_SECRET_PEPPER);
    let incident;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        incident = await IncidentModel.create({
          trackingId: generateTrackingId(),
          secretHash,
          title: input.title,
          description: input.description,
          category: input.category,
          incidentAt,
          location: { type: "Point", coordinates: [input.lng, input.lat] },
          roadName: input.roadName,
          areaName: input.areaName,
          ...(input.safetyTip ? { safetyTip: input.safetyTip } : {}),
          actorId,
          source: "public",
          contentHash: hash,
        });
        break;
      } catch (error: any) {
        if (error?.code !== 11000 || attempt === 3) throw error;
      }
    }
    if (!incident) throw new AppError("CONFLICT", "Could not allocate a Tracking ID.");

    return {
      incident: await toPublicIncident(incident, actorId),
      credentials: { trackingId: incident.trackingId, secret },
    };
  }

  async list(input: ListIncidentInput, actorId?: string) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? RULES.incidentPageSize;
    const filter: FilterQuery<any> = { status: "published" };
    if (input.category) filter.category = input.category;
    if (input.from || input.to) {
      filter.incidentAt = {
        ...(input.from ? { $gte: new Date(input.from) } : {}),
        ...(input.to ? { $lte: new Date(input.to) } : {}),
      };
    }
    if (input.q) {
      const expression = new RegExp(escapeRegex(input.q), "i");
      filter.$or = [{ title: expression }, { roadName: expression }, { areaName: expression }];
    }
    if (
      input.minLat !== undefined &&
      input.minLng !== undefined &&
      input.maxLat !== undefined &&
      input.maxLng !== undefined
    ) {
      filter.location = {
        $geoWithin: {
          $box: [
            [input.minLng, input.minLat],
            [input.maxLng, input.maxLat],
          ],
        },
      };
    } else if (input.lat !== undefined && input.lng !== undefined && input.radiusKm !== undefined) {
      filter.location = {
        $geoWithin: {
          $centerSphere: [[input.lng, input.lat], input.radiusKm / 6_378.1],
        },
      };
    }

    const [documents, totalItems] = await Promise.all([
      IncidentModel.find(filter)
        .sort({ createdAt: input.sort === "oldest" ? 1 : -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      IncidentModel.countDocuments(filter),
    ]);
    return {
      items: await Promise.all(documents.map((document) => toPublicIncident(document, actorId))),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async get(trackingId: string, actorId?: string) {
    const incident = await requirePublishedIncident(trackingId);
    if (!incident) throw new AppError("NOT_FOUND", "Incident not found.");
    return { incident: await toPublicIncident(incident, actorId) };
  }
}
