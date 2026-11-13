import mongoose from "mongoose";

export async function connectDatabase(uri: string, autoIndex = false) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { autoIndex });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function databaseIsReady() {
  return mongoose.connection.readyState === 1;
}
