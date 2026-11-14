import { Redis } from "@upstash/redis";

const FEED_KEY = "public-feed:v1";
const FEED_TTL_SECONDS = 20;

export interface FeedCache {
  get<T>(): Promise<T | null>;
  set<T>(value: T): Promise<void>;
  invalidate(): Promise<void>;
}

export class InMemoryFeedCache implements FeedCache {
  private value: { data: unknown; expiresAt: number } | null = null;

  async get<T>() {
    if (!this.value || this.value.expiresAt <= Date.now()) return null;
    return this.value.data as T;
  }

  async set<T>(value: T) {
    this.value = { data: value, expiresAt: Date.now() + FEED_TTL_SECONDS * 1_000 };
  }

  async invalidate() {
    this.value = null;
  }
}

export class UpstashFeedCache implements FeedCache {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async get<T>() {
    return (await this.redis.get<T>(FEED_KEY)) ?? null;
  }

  async set<T>(value: T) {
    await this.redis.set(FEED_KEY, value, { ex: FEED_TTL_SECONDS });
  }

  async invalidate() {
    await this.redis.del(FEED_KEY);
  }
}
