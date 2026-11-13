import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function randomCharacters(length: number) {
  const buffer = randomBytes(length);
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += TRACKING_ALPHABET[buffer[index]! % TRACKING_ALPHABET.length];
  }
  return value;
}

export function generateTrackingId() {
  return `MD-${randomCharacters(6)}`;
}

export function generateReporterSecret() {
  return randomCharacters(16).match(/.{4}/g)!.join("-");
}

export function deriveHmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function contentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeReporterSecret(value: string) {
  return value.trim().toUpperCase();
}

export async function hashReporterSecret(secret: string, pepper: string) {
  const salt = randomBytes(16);
  const normalized = normalizeReporterSecret(secret);
  const derived = (await scrypt(`${normalized}:${pepper}`, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyReporterSecret(secret: string, encoded: string, pepper: string) {
  const [algorithm, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;

  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  const actual = (await scrypt(
    `${normalizeReporterSecret(secret)}:${pepper}`,
    salt,
    expected.length,
  )) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
