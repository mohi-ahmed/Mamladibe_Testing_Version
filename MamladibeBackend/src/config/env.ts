import "dotenv/config";

import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    HOST: z.string().min(1).default("0.0.0.0"),
    MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/mamladibe"),
    ACTOR_HMAC_SECRET: z.string().min(32).default("development-actor-secret-change-me-123456"),
    NETWORK_HMAC_SECRET: z.string().min(32).default("development-network-secret-change-me-1234"),
    REPORTER_SECRET_PEPPER: z.string().min(32).default("development-reporter-pepper-change-me-12"),
    TOTP_ENCRYPTION_KEY: z.string().min(32).default("development-totp-encryption-key-change-me"),
    ADMIN_BOOTSTRAP_EMAIL: z.string().email().max(254).optional(),
    ADMIN_SESSION_ABSOLUTE_SECONDS: z.coerce.number().int().min(300).default(28_800),
    ADMIN_SESSION_IDLE_SECONDS: z.coerce.number().int().min(60).default(1_800),
    ADMIN_LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).max(20).default(5),
    ADMIN_LOGIN_LOCK_SECONDS: z.coerce.number().int().min(60).default(900),
    TURNSTILE_SECRET: z.string().default(""),
    UPSTASH_REDIS_REST_URL: z.string().url().or(z.literal("")).default(""),
    UPSTASH_REDIS_REST_TOKEN: z.string().default(""),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),
    GEOCODER_BASE_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
    GEOCODER_USER_AGENT: z.string().min(3).default("Mamladibe/1.0 (development)"),
    COOKIE_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(31_536_000),
    TRUST_PROXY: booleanString,
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;

    const secretKeys = [
      "ACTOR_HMAC_SECRET",
      "NETWORK_HMAC_SECRET",
      "REPORTER_SECRET_PEPPER",
      "TOTP_ENCRYPTION_KEY",
    ] as const;
    for (const key of secretKeys) {
      if (value[key].startsWith("development-")) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be replaced in production`,
        });
      }
    }

    const required: Array<keyof typeof value> = [
      "TURNSTILE_SECRET",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ];
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in production` });
      }
    }
    if (value.ALLOWED_ORIGINS.includes("localhost")) {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOWED_ORIGINS"],
        message: "Production origins must not use localhost",
      });
    }
  });

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${summary}`);
  }

  const value = parsed.data;
  return {
    ...value,
    isProduction: value.NODE_ENV === "production",
    allowedOrigins: value.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    hasRedis: Boolean(value.UPSTASH_REDIS_REST_URL && value.UPSTASH_REDIS_REST_TOKEN),
  };
}
