import { loadConfig } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { IncidentModel } from "../models/index.js";

const SEED_ACTOR_ID = "development-map-cluster-seed-v1";
const config = loadConfig();

if (config.isProduction) {
  throw new Error("Map test incidents may not be removed in production mode");
}

await connectDatabase(config.MONGODB_URI, false);

try {
  const result = await IncidentModel.deleteMany({ actorId: SEED_ACTOR_ID });
  console.log(`Removed map test incidents: ${result.deletedCount}`);
} finally {
  await disconnectDatabase();
}
