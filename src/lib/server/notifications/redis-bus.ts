import Redis from "ioredis";
import type {
  NormalizedNotificationEvent,
  NotificationBus,
  NotificationBusHealth,
  NotificationListener,
  NotificationSubscriptionOptions,
  NotificationUnsubscribe,
} from "@/lib/server/notifications/types";
import { isNormalizedNotificationEvent } from "@/lib/server/notifications/types";

const CHANNEL_PREFIX = "vercelwarden:notifications:";
const HISTORY_PREFIX = "vercelwarden:notifications:history:";
const DEFAULT_MAX_HISTORY_ENTRIES = 100;
const DEFAULT_HISTORY_TTL_SECONDS = 3_600;
const DEFAULT_REPLAY_WINDOW_MS = 15_000;

export interface RedisPubSubClient {
  readonly status?: string;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<unknown>;
  zrangebyscore(key: string, min: string, max: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<unknown>;
  on(event: "message", listener: (channel: string, message: string) => void): unknown;
  off(event: "message", listener: (channel: string, message: string) => void): unknown;
}

export type RedisClientFactory = (url: string, role: "publisher" | "subscriber") => RedisPubSubClient;

function createRedisClient(url: string, role: "publisher" | "subscriber"): RedisPubSubClient {
  return new Redis(url, {
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: role === "subscriber" ? null : 2,
    retryStrategy(times) {
      return Math.min(100 * 2 ** Math.min(times, 6), 5_000);
    },
  });
}

function channelFor(userUuid: string): string {
  return `${CHANNEL_PREFIX}${encodeURIComponent(userUuid)}`;
}

function historyKeyFor(userUuid: string): string {
  return `${HISTORY_PREFIX}${encodeURIComponent(userUuid)}`;
}

export interface RedisNotificationBusOptions {
  maxHistoryEntries?: number;
  historyTtlSeconds?: number;
  replayWindowMs?: number;
  now?: () => number;
}

interface LocalSubscription {
  listeners: Set<NotificationListener>;
  lastSequenceByListener: Map<NotificationListener, number>;
}

export class RedisNotificationBus implements NotificationBus {
  readonly kind = "redis" as const;
  private readonly url: string;
  private readonly factory: RedisClientFactory;
  private readonly publisher: RedisPubSubClient;
  private subscriber: RedisPubSubClient | null = null;
  private readonly subscriptions = new Map<string, LocalSubscription>();
  private readonly maxHistoryEntries: number;
  private readonly historyTtlSeconds: number;
  private readonly replayWindowMs: number;
  private readonly now: () => number;
  private closed = false;

  constructor(
    url: string,
    factory: RedisClientFactory = createRedisClient,
    options: RedisNotificationBusOptions = {}
  ) {
    if (!url.trim()) throw new Error("A Redis Pub/Sub URL is required.");
    this.url = url;
    this.factory = factory;
    // The publisher is needed on every instance — to publish, and to read the
    // replay history. The subscriber is created lazily on the first subscribe()
    // so publish-only instances never open an idle subscriber connection.
    this.publisher = factory(url, "publisher");
    this.maxHistoryEntries = options.maxHistoryEntries ?? DEFAULT_MAX_HISTORY_ENTRIES;
    this.historyTtlSeconds = options.historyTtlSeconds ?? DEFAULT_HISTORY_TTL_SECONDS;
    this.replayWindowMs = options.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
  }

  private ensureSubscriber(): RedisPubSubClient {
    if (!this.subscriber) {
      this.subscriber = this.factory(this.url, "subscriber");
      this.subscriber.on("message", this.onMessage);
    }
    return this.subscriber;
  }

  async publish(event: NormalizedNotificationEvent): Promise<void> {
    if (this.closed) throw new Error("Notification bus is closed.");
    const payload = JSON.stringify(event);
    const historyKey = historyKeyFor(event.userUuid);
    try {
      // Record into a bounded per-user history BEFORE publishing, so anything a
      // live subscriber sees was already persisted. A subscriber that missed the
      // live frame (subscribe-boundary race or a brief reconnect) then catches up
      // via replayHistory() on its next subscribe.
      await this.publisher.zadd(historyKey, event.sequence, payload);
      await this.publisher.zremrangebyrank(historyKey, 0, -(this.maxHistoryEntries + 1));
      await this.publisher.expire(historyKey, this.historyTtlSeconds);
    } catch {
      // History is a best-effort catch-up buffer; never let it block live delivery.
    }
    await this.publisher.publish(channelFor(event.userUuid), payload);
  }

  async subscribe(
    userUuid: string,
    listener: NotificationListener,
    options: NotificationSubscriptionOptions = {}
  ): Promise<NotificationUnsubscribe> {
    if (this.closed) throw new Error("Notification bus is closed.");
    const channel = channelFor(userUuid);
    let subscription = this.subscriptions.get(channel);
    if (!subscription) {
      subscription = { listeners: new Set(), lastSequenceByListener: new Map() };
      this.subscriptions.set(channel, subscription);
      try {
        await this.ensureSubscriber().subscribe(channel);
      } catch (error) {
        this.subscriptions.delete(channel);
        throw error;
      }
    }
    subscription.listeners.add(listener);
    const lastSequence = options.lastSequence ?? 0;
    subscription.lastSequenceByListener.set(listener, lastSequence);
    let active = true;
    const unsubscribe = async () => {
      if (!active) return;
      active = false;
      const current = this.subscriptions.get(channel);
      if (!current) return;
      current.listeners.delete(listener);
      current.lastSequenceByListener.delete(listener);
      if (current.listeners.size === 0) {
        this.subscriptions.delete(channel);
        await this.subscriber?.unsubscribe(channel);
      }
    };
    // Catch up on events published during the subscribe-boundary race or a brief
    // reconnect gap. Reads go through the publisher connection — the subscriber is
    // in subscribe mode and cannot run regular commands.
    await this.replayHistory(userUuid, subscription, listener, lastSequence);
    return unsubscribe;
  }

  async health(): Promise<NotificationBusHealth> {
    const subscriber = this.subscriber;
    try {
      const pings = [this.publisher.ping()];
      if (subscriber) pings.push(subscriber.ping());
      await Promise.all(pings);
      return {
        kind: this.kind,
        ready: true,
        publisher: this.publisher.status ?? "ready",
        subscriber: subscriber ? (subscriber.status ?? "ready") : "idle",
      };
    } catch {
      return {
        kind: this.kind,
        ready: false,
        publisher: this.publisher.status ?? "unavailable",
        subscriber: subscriber ? (subscriber.status ?? "unavailable") : "idle",
      };
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.subscriber?.off("message", this.onMessage);
    this.subscriptions.clear();
    const shutdowns = [this.publisher.quit()];
    if (this.subscriber) shutdowns.push(this.subscriber.quit());
    await Promise.allSettled(shutdowns);
  }

  private dispatch(
    subscription: LocalSubscription,
    listener: NotificationListener,
    event: NormalizedNotificationEvent
  ): void {
    const lastSequence = subscription.lastSequenceByListener.get(listener) ?? 0;
    if (event.sequence <= lastSequence) return;
    subscription.lastSequenceByListener.set(listener, event.sequence);
    void Promise.resolve(listener(event)).catch(() => undefined);
  }

  private async replayHistory(
    userUuid: string,
    subscription: LocalSubscription,
    listener: NotificationListener,
    lastSequence: number
  ): Promise<void> {
    if (this.replayWindowMs <= 0) return;
    let entries: string[];
    try {
      entries = await this.publisher.zrangebyscore(historyKeyFor(userUuid), `(${lastSequence}`, "+inf");
    } catch {
      return; // Best-effort: live Pub/Sub and the revision poll still converge.
    }
    const cutoff = this.now() - this.replayWindowMs;
    for (const raw of entries) {
      if (!subscription.listeners.has(listener)) return; // unsubscribed mid-replay
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!isNormalizedNotificationEvent(parsed) || parsed.userUuid !== userUuid) continue;
      if (Date.parse(parsed.publishedAt) < cutoff) continue; // only the recent gap
      this.dispatch(subscription, listener, parsed);
    }
  }

  private readonly onMessage = (channel: string, message: string) => {
    const subscription = this.subscriptions.get(channel);
    if (!subscription) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (!isNormalizedNotificationEvent(parsed) || channelFor(parsed.userUuid) !== channel) return;
    for (const listener of subscription.listeners) {
      this.dispatch(subscription, listener, parsed);
    }
  };
}

