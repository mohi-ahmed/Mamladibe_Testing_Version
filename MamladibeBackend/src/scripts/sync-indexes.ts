import { loadConfig } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import {
  ActorModel,
  AdminSessionModel,
  AdminUserModel,
  AuditLogModel,
  BlockModel,
  CommentModel,
  GeoCacheModel,
  IncidentModel,
  IncidentVersionModel,
  RateEventModel,
  ReportModel,
  VoteModel,
} from "../models/index.js";

const config = loadConfig();
await connectDatabase(config.MONGODB_URI, false);

const models = [
  IncidentModel,
  IncidentVersionModel,
  CommentModel,
  VoteModel,
  ReportModel,
  ActorModel,
  RateEventModel,
  BlockModel,
  GeoCacheModel,
  AdminUserModel,
  AdminSessionModel,
  AuditLogModel,
];

for (const model of models) {
  await model.syncIndexes();
  console.log(`Synchronized indexes: ${model.modelName}`);
}

await disconnectDatabase();
