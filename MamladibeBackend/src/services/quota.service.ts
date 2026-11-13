import { randomUUID } from "node:crypto";

import { Redis } from "@upstash/redis";

import { RULES } from "../lib/constants.js";

export interface QuotaReservation {
  allowed: true;
  member: string;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: Date;
}

export interface QuotaRejection {
  allowed: false;
  limit: number;
  resetsAt: Date;
}

export interface CommentQuotaStore {
  reserve(actorId: string, now?: Date): Promise<QuotaReservation | QuotaRejection>;
  release(actorId: string, member: string): Promise<void>;
  ping(): Promise<boolean>;
}

export class InMemoryCommentQuotaStore implements CommentQuotaStore {
  private readonly events = new Map<string, Array<{ member: string; time: number }>>();

  async reserve(actorId: string, now = new Date()) {
    const cutoff = now.getTime() - RULES.commentWindowMs;
    const current = (this.events.get(actorId) ?? []).filter((event) => event.time > cutoff);
    if (current.length >= RULES.commentsPerWindow) {
      this.events.set(actorId, current);
      return {
        allowed: false as const,
        limit: RULES.commentsPerWindow,
        resetsAt: new Date(current[0]!.time + RULES.commentWindowMs),
      };
    }

    const member = `${now.getTime()}:${randomUUID()}`;
    current.push({ member, time: now.getTime() });
    this.events.set(actorId, current);
    const oldest = current[0]!.time;
    return {
      allowed: true as const,
      member,
      limit: RULES.commentsPerWindow,
      used: current.length,
      remaining: RULES.commentsPerWindow - current.length,
      resetsAt: new Date(oldest + RULES.commentWindowMs),
    };
  }

  async release(actorId: string, member: string) {
    const current = this.events.get(actorId) ?? [];
    this.events.set(
      actorId,
      current.filter((event) => event.member !== member),
    );
  }

  async ping() {
    return true;
  }
}

const RESERVE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local cutoff = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
if count >= limit then
  local oldestScore = now
  if #oldest == 2 then oldestScore = tonumber(oldest[2]) end
  return {0, count, oldestScore}
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
if count == 0 then
  return {1, 1, now}
end
return {1, count + 1, tonumber(oldest[2])}
`;

export class UpstashCommentQuotaStore implements CommentQuotaStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  private key(actorId: string) {
    return `quota:comments:${actorId}`;
  }

  async reserve(actorId: string, now = new Date()) {
    const member = `${now.getTime()}:${randomUUID()}`;
    const result = (await this.redis.eval(
      RESERVE_SCRIPT,
      [this.key(actorId)],
      [
        now.getTime(),
        now.getTime() - RULES.commentWindowMs,
        RULES.commentsPerWindow,
        member,
        Math.ceil(RULES.commentWindowMs / 1_000) + 60,
      ],
    )) as [number, number, number];
    const [allowed, used, oldest] = result.map(Number) as [number, number, number];
    if (!allowed) {
      return {
        allowed: false as const,
        limit: RULES.commentsPerWindow,
        resetsAt: new Date(oldest + RULES.commentWindowMs),
      };
    }
    return {
      allowed: true as const,
      member,
      limit: RULES.commentsPerWindow,
      used,
      remaining: RULES.commentsPerWindow - used,
      resetsAt: new Date(oldest + RULES.commentWindowMs),
    };
  }

  async release(actorId: string, member: string) {
    await this.redis.zrem(this.key(actorId), member);
  }

  async ping() {
    return (await this.redis.ping()) === "PONG";
  }
}
