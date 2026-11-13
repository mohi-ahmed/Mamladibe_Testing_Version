import { Redis } from "@upstash/redis";

import { loadConfig } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { deriveHmac } from "../lib/crypto.js";
import { CommentModel, IncidentModel, VoteModel } from "../models/index.js";

const MAP_SEED_ACTOR_ID = "development-map-cluster-seed-v1";
const ACCEPTANCE_TRACKING_ID = "MD-CN53W3";
const ACCEPTANCE_COMMENT_TEXTS = ["Ki bolen vai!", "kobe?", "kokhon?", "accha", "ok ok", "hai hai"];

interface IdRecord {
  _id: unknown;
}

interface CommentActorRecord extends IdRecord {
  actorId?: string;
}

const config = loadConfig();
if (config.isProduction) {
  throw new Error("Acceptance-test interactions may not be removed in production mode");
}

await connectDatabase(config.MONGODB_URI, false);

try {
  const seededIncidents = (await IncidentModel.find({ actorId: MAP_SEED_ACTOR_ID })
    .select("_id")
    .lean()) as unknown as IdRecord[];
  const acceptanceIncident = (await IncidentModel.findOne({
    trackingId: ACCEPTANCE_TRACKING_ID,
  })
    .select("_id")
    .lean()) as unknown as IdRecord | null;
  const seededIds = seededIncidents.map((incident) => incident._id);
  const voteIncidentIds = [...seededIds, ...(acceptanceIncident ? [acceptanceIncident._id] : [])];

  const acceptanceComments = acceptanceIncident
    ? await CommentModel.find({
        incidentId: acceptanceIncident._id,
        text: { $in: ACCEPTANCE_COMMENT_TEXTS },
      })
        .select("_id +actorId")
        .lean<CommentActorRecord[]>()
    : [];
  const seededComments = await CommentModel.find({ incidentId: { $in: seededIds } })
    .select("_id +actorId")
    .lean<CommentActorRecord[]>();
  const comments = [...acceptanceComments, ...seededComments];
  const actorIds = [...new Set(comments.map((comment) => comment.actorId).filter(Boolean))];

  const [votes, removedComments] = await Promise.all([
    VoteModel.deleteMany({ incidentId: { $in: voteIncidentIds } }),
    CommentModel.deleteMany({ _id: { $in: comments.map((comment) => comment._id) } }),
  ]);

  if (config.hasRedis && actorIds.length > 0) {
    const redis = new Redis({
      url: config.UPSTASH_REDIS_REST_URL,
      token: config.UPSTASH_REDIS_REST_TOKEN,
    });
    const localNetworkHash = deriveHmac("127.0.0.1", config.NETWORK_HMAC_SECRET);
    await Promise.all([
      ...actorIds.flatMap((actorId) => [
        redis.del(`quota:comments:${actorId}`),
        redis.del(`rate:incident:actor:${actorId}`),
      ]),
      redis.del(`quota:comments:network:${localNetworkHash}`),
      redis.del(`rate:incident:network:${localNetworkHash}`),
      redis.del(`rate:vote:network:${localNetworkHash}`),
    ]);
  }

  console.log(
    `Removed acceptance-test interactions: ${votes.deletedCount} votes, ${removedComments.deletedCount} comments`,
  );
} finally {
  await disconnectDatabase();
}
