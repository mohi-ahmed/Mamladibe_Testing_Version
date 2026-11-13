import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import mongoose from "mongoose";
import qrcode from "qrcode-terminal";

import { loadConfig } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import {
  createTotpEnrollment,
  encryptTotpSecret,
  hashAdminPassword,
} from "../lib/admin-security.js";
import { AdminUserModel } from "../models/admin.js";
import { writeAudit } from "../services/audit.service.js";

async function hiddenPrompt(label: string) {
  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode)
    throw new Error("Secure password input requires an interactive terminal.");
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          done();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          done();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (char >= " ") {
          value += char;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

const config = loadConfig();
await connectDatabase(config.MONGODB_URI, false);
try {
  const activeSuper = await AdminUserModel.exists({ role: "super_admin", active: true });
  if (activeSuper) throw new Error("An active Super Admin already exists. Bootstrap refused.");
  const terminal = createInterface({ input: stdin, output: stdout });
  const email = (config.ADMIN_BOOTSTRAP_EMAIL ?? (await terminal.question("Super Admin email: ")))
    .trim()
    .toLowerCase();
  terminal.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Error("A valid email is required.");
  const password = await hiddenPrompt("Password (12-128 chars): ");
  const confirmation = await hiddenPrompt("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  if (password.length < 12 || password.length > 128)
    throw new Error("Password must contain 12 to 128 characters.");

  const enrollment = createTotpEnrollment(email);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [admin] = await AdminUserModel.create(
        [
          {
            email,
            passwordHash: await hashAdminPassword(password),
            role: "super_admin",
            totpSecretEncrypted: encryptTotpSecret(enrollment.secret, config.TOTP_ENCRYPTION_KEY),
            active: true,
            enrolledAt: new Date(),
          },
        ],
        { session },
      );
      await writeAudit(
        {
          adminId: admin.id,
          action: "admin.create",
          targetType: "admin",
          targetId: admin.id,
          reason: "Secure first Super Admin bootstrap",
          after: { email, role: "super_admin", active: true },
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }
  stdout.write("\nSuper Admin created. Scan this QR code now; it will not be shown again:\n\n");
  qrcode.generate(enrollment.otpauthUri, { small: true }, (code) => stdout.write(`${code}\n`));
  stdout.write("If scanning is unavailable, import this private TOTP URI manually:\n");
  stdout.write(`${enrollment.otpauthUri}\n`);
} finally {
  await disconnectDatabase();
}
