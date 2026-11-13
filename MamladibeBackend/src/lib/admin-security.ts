import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { Algorithm, hash, verify as verifyArgon2 } from "@node-rs/argon2";
import { generateSecret, generateURI, verify as verifyOtp } from "otplib";

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashAdminPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyAdminPassword(encoded: string, password: string) {
  return verifyArgon2(encoded, password, ARGON2_OPTIONS);
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptTotpSecret(secret: string, keySecret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keySecret), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptTotpSecret(encoded: string, keySecret: string) {
  const [version, ivValue, tagValue, ciphertextValue] = encoded.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted TOTP value");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(keySecret),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createTotpEnrollment(email: string) {
  const secret = generateSecret({ length: 20 });
  return {
    secret,
    otpauthUri: generateURI({ issuer: "Mamladibe", label: email, secret, period: 30, digits: 6 }),
  };
}

export async function verifyTotp(secret: string, token: string) {
  const result = await verifyOtp({ secret, token, period: 30, digits: 6, epochTolerance: 30 });
  return result.valid;
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeTokenEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
