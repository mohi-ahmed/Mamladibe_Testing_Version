import { loadConfig } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { contentHash, generateTrackingId } from "../lib/crypto.js";
import { IncidentModel } from "../models/index.js";

const SEED_ACTOR_ID = "development-map-cluster-seed-v1";

const mohakhaliPoints = Array.from({ length: 20 }, (_, index) => {
  const row = Math.floor(index / 5);
  const column = index % 5;
  return {
    lat: 23.7778 + row * 0.0011,
    lng: 90.4002 + column * 0.0011,
    areaName: "Mohakhali",
    roadName: `Test Cluster Road ${row + 1}`,
  };
});

const spreadPoints = [
  { lat: 23.7633, lng: 90.4312, areaName: "Banasree", roadName: "Test Banasree Road" },
  { lat: 23.8067, lng: 90.3686, areaName: "Mirpur", roadName: "Test Mirpur Road" },
  { lat: 23.7465, lng: 90.376, areaName: "Dhanmondi", roadName: "Test Dhanmondi Road" },
  { lat: 23.7104, lng: 90.4074, areaName: "Old Dhaka", roadName: "Test Old Dhaka Road" },
  { lat: 23.8759, lng: 90.3795, areaName: "Uttara", roadName: "Test Uttara Road" },
];

const points = [...mohakhaliPoints, ...spreadPoints];
const categories = ["road", "safety", "accident", "violation", "police"] as const;

const config = loadConfig();
if (config.isProduction) {
  throw new Error("Map test incidents may not be seeded in production mode");
}

await connectDatabase(config.MONGODB_URI, false);

try {
  let inserted = 0;

  for (const [index, point] of points.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const result = await IncidentModel.updateOne(
      { contentHash: contentHash(`${SEED_ACTOR_ID}:${number}`) },
      {
        $setOnInsert: {
          trackingId: generateTrackingId(),
          title: `[TEST] Map cluster incident ${number}`,
          description:
            "Development-only fixture for incident search, pagination, viewport, and marker clustering regression tests.",
          category: categories[index % categories.length],
          incidentAt: new Date(Date.UTC(2026, 10, 12, 6, index)),
          location: { type: "Point", coordinates: [point.lng, point.lat] },
          roadName: point.roadName,
          areaName: point.areaName,
          safetyTip: "This is test data; do not treat it as a real incident.",
          status: "published",
          actorId: SEED_ACTOR_ID,
          source: "admin",
          contentHash: contentHash(`${SEED_ACTOR_ID}:${number}`),
          isEdited: false,
          byModerator: false,
        },
      },
      { upsert: true },
    );
    inserted += result.upsertedCount;
  }

  const total = await IncidentModel.countDocuments({ actorId: SEED_ACTOR_ID });
  console.log(`Map test incidents ready: ${total} (inserted now: ${inserted})`);
  if (total !== points.length) {
    throw new Error(`Expected ${points.length} map test incidents, found ${total}`);
  }
} finally {
  await disconnectDatabase();
}
