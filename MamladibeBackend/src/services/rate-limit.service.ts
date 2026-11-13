import { Redis } from "@upstash/redis";

import { AppError } from "../lib/app-error.js";

export type RateLimitAction = "incident" | "vote" | "flag" | "track" | "admin_login";
export type RateLimitScope = "actor" | "network";

const POLICIES: Record<
  RateLimitAction,
  Record<RateLimitScope, { limit: number; windowSeconds: number }>
> = {
  incident: {
    actor: { limit: 5, windowSeconds: 60 * 60 },
    network: { limit: 5, windowSeconds: 60 * 60 },
  },
  vote: {
    actor: { limit: 120, windowSeconds: 60 },
    network: { limit: 30, windowSeconds: 60 * 60 },
  },
  flag: {
    actor: { limit: 30, windowSeconds: 60 * 60 },
    network: { limit: 30, windowSeconds: 60 * 60 },
  },
  track: {
    actor: { limit: 30, windowSeconds: 15 * 60 },
    network: { limit: 30, windowSeconds: 15 * 60 },
  },
  admin_login: {
    actor: { limit: 20, windowSeconds: 15 * 60 },
    network: { limit: 20, windowSeconds: 15 * 60 },
  },
};

interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  consume(
    action: RateLimitAction,
    subject: string,
    scope?: RateLimitScope,
  ): Promise<RateLimitDecision>;
  ping(): Promise<boolean>;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();

  async consume(action: RateLimitAction, subject: string, scope: RateLimitScope = "actor") {
    const policy = POLICIES[action][scope];
    const key = `${action}:${scope}:${subject}`;
    const now = Date.now();
    let counter = this.counters.get(key);
    if (!counter || counter.expiresAt <= now) {
      counter = { count: 0, expiresAt: now + policy.windowSeconds * 1_000 };
    }
    counter.count += 1;
    this.counters.set(key, counter);
    return {
      allowed: counter.count <= policy.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((counter.expiresAt - now) / 1_000)),
    };
  }

  async ping() {
    return true;
  }
}

const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

export class UpstashRateLimitStore implements RateLimitStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async consume(action: RateLimitAction, subject: string, scope: RateLimitScope = "actor") {
    const policy = POLICIES[action][scope];
    const result = (await this.redis.eval(
      CONSUME_SCRIPT,
      [`rate:${action}:${scope}:${subject}`],
      [policy.windowSeconds],
    )) as [number, number];
    const [count, ttl] = result.map(Number) as [number, number];
    return {
      allowed: count <= policy.limit,
      retryAfterSeconds: Math.max(1, ttl),
    };
  }

  async ping() {
    return (await this.redis.ping()) === "PONG";
  }
}

export async function enforceRateLimit(
  store: RateLimitStore,
  action: RateLimitAction,
  subject: string,
  scope: RateLimitScope = "actor",
) {
  const decision = await store.consume(action, subject, scope);
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", "Too many requests. Try again later.", {
      details: { retryAfterSeconds: decision.retryAfterSeconds },
    });
  }
}
