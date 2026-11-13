import type { FastifyInstance } from "fastify";

import { buildApp } from "./src/create-app.js";
import { loadConfig } from "./src/config/env.js";
import { connectDatabase } from "./src/database/mongoose.js";

const config = loadConfig();

await connectDatabase(config.MONGODB_URI, false);

const app: FastifyInstance = await buildApp({ config });

void app.listen({ port: config.PORT, host: config.HOST });

export default app;
