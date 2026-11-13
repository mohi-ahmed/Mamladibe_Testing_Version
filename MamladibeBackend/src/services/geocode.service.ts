import type { AppConfig } from "../config/env.js";
import { isInBangladesh } from "../lib/constants.js";
import { AppError } from "../lib/app-error.js";
import { GeoCacheModel } from "../models/index.js";

interface NominatimResult {
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
  };
}

export class GeocodeService {
  constructor(private readonly config: AppConfig) {}

  async reverse(lat: number, lng: number) {
    if (!isInBangladesh(lat, lng)) {
      throw new AppError("OUTSIDE_BANGLADESH", "Coordinates must be inside Bangladesh.");
    }
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached: any = await GeoCacheModel.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
    if (cached) {
      return { location: { roadName: cached.roadName ?? "", areaName: cached.areaName ?? "" } };
    }

    let roadName = "";
    let areaName = "";
    try {
      const url = new URL("/reverse", this.config.GEOCODER_BASE_URL);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));
      url.searchParams.set("addressdetails", "1");
      const response = await fetch(url, {
        headers: { "user-agent": this.config.GEOCODER_USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(4_000),
      });
      if (response.ok) {
        const result = (await response.json()) as NominatimResult;
        const address = result.address ?? {};
        roadName = address.road ?? "";
        areaName =
          address.neighbourhood ??
          address.suburb ??
          address.city_district ??
          address.city ??
          address.town ??
          address.village ??
          "";
      }
    } catch {
      // A geocoder outage must not block manual location entry.
    }
    await GeoCacheModel.findOneAndUpdate(
      { key },
      {
        $set: {
          roadName,
          areaName,
          provider: "nominatim",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
        },
      },
      { upsert: true },
    );
    return { location: { roadName, areaName } };
  }
}
