import { ActorModel, BlockModel } from "../models/index.js";
import { AppError } from "../lib/app-error.js";

export async function touchActor(actorId: string, now = new Date()) {
  await ActorModel.updateOne(
    { actorId },
    {
      $setOnInsert: { actorId, firstSeenAt: now },
      $set: { lastSeenAt: now },
    },
    { upsert: true },
  );
}

export async function ensureActorIsAllowed(actorId: string, networkHash: string, now = new Date()) {
  const blocked = await BlockModel.exists({
    active: true,
    $or: [{ mode: "permanent" }, { expiresAt: { $gt: now } }],
    $and: [
      {
        $or: [
          { targetType: "anonymous_id", targetHash: actorId },
          { targetType: "network_hash", targetHash: networkHash },
        ],
      },
    ],
  });
  if (blocked)
    throw new AppError("ACTOR_BLOCKED", "This browser is not allowed to perform this action.");
}
