import { Redis } from "@upstash/redis";

import { loadConfig } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { deriveHmac, randomToken } from "../lib/crypto.js";
import { ActorModel } from "../models/index.js";

const config = loadConfig();
if (config.isProduction) throw new Error("Acceptance checks may not run in production mode");
if (!config.hasRedis) throw new Error("Live Redis is required for the rate-limit acceptance check");

const origin = config.allowedOrigins.find((value) => value === "http://127.0.0.1:8080");
if (!origin) throw new Error("The local frontend origin is not allowed by the backend");

const networkHash = deriveHmac("127.0.0.1", config.NETWORK_HMAC_SECRET);
const redis = new Redis({
  url: config.UPSTASH_REDIS_REST_URL,
  token: config.UPSTASH_REDIS_REST_TOKEN,
});
const results: Array<{ status: number; code: string | undefined }> = [];
const actorIds: string[] = [];

await connectDatabase(config.MONGODB_URI, false);

try {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const token = randomToken();
    actorIds.push(deriveHmac(token, config.ACTOR_HMAC_SECRET));
    const response = await fetch(`http://127.0.0.1:${config.PORT}/api/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mdb_anon=${token}`,
        Origin: origin,
      },
      body: "{}",
    });
    const body = (await response.json()) as { error?: { code?: string } };
    results.push({ status: response.status, code: body.error?.code });
  }

  const allowedPhase = results.slice(0, 5).every(({ status }) => status !== 429);
  const limited = results[5]?.status === 429 && results[5]?.code === "RATE_LIMITED";
  if (!allowedPhase || !limited) {
    throw new Error(`Unexpected incident rate-limit result: ${JSON.stringify(results)}`);
  }
  console.log(`Incident rate-limit acceptance passed: ${JSON.stringify(results)}`);
} finally {
  await Promise.all([
    ...actorIds.map((actorId) => redis.del(`rate:incident:actor:${actorId}`)),
    redis.del(`rate:incident:network:${networkHash}`),
    ActorModel.deleteMany({ actorId: { $in: actorIds } }),
  ]);
  await disconnectDatabase();
}
