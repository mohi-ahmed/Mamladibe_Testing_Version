import { buildApp } from "./src/create-app.js";
import { loadConfig } from "./src/config/env.js";
import { connectDatabase } from "./src/database/mongoose.js";

const config = loadConfig();
const databaseReady = connectDatabase(config.MONGODB_URI, false);
void databaseReady.catch((error: unknown) => {
  console.error("MongoDB connection failed", error);
});
const app = buildApp({ config, databaseReady });

void app.listen({ port: config.PORT, host: config.HOST });
