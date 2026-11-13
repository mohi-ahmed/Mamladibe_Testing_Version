import mongoose from "mongoose";

let connectionPromise: ReturnType<typeof mongoose.connect> | null = null;

export async function connectDatabase(uri: string, autoIndex = false) {
  mongoose.set("strictQuery", true);

  if (mongoose.connection.readyState === 1) return mongoose;

  connectionPromise ??= mongoose.connect(uri, {
    autoIndex,
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  connectionPromise = null;
}

export function databaseIsReady() {
  return mongoose.connection.readyState === 1;
}
