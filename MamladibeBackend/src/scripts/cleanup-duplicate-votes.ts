import { loadConfig } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { VoteModel } from "../models/index.js";

const apply = process.argv.includes("--apply");
const config = loadConfig();
await connectDatabase(config.MONGODB_URI, false);

try {
  const duplicates = await VoteModel.aggregate([
    { $sort: { updatedAt: -1 } },
    {
      $group: {
        _id: { incidentId: "$incidentId", actorId: "$actorId" },
        keep: { $first: "$_id" },
        remove: { $push: "$_id" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
  const removeIds = duplicates.flatMap((row: any) =>
    row.remove.filter((id: unknown) => String(id) !== String(row.keep)),
  );

  if (!apply) {
    console.log(
      `Dry run: ${duplicates.length} duplicated actor/incident pairs; ${removeIds.length} stale votes. Pass --apply to remove them.`,
    );
  } else {
    const result = await VoteModel.deleteMany({ _id: { $in: removeIds } });
    console.log(`Removed ${result.deletedCount} stale duplicate votes; newest vote was preserved.`);
  }
} finally {
  await disconnectDatabase();
}
