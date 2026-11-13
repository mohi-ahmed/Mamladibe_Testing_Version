import { buildApp } from "./create-app.js";
import { loadConfig } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./database/mongoose.js";

const config = loadConfig();
await connectDatabase(config.MONGODB_URI, config.NODE_ENV !== "production");
const app = await buildApp({ config });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await disconnectDatabase();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(error);
  await disconnectDatabase();
  process.exit(1);
}
