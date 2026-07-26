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

export interface RedisPubSubClient {
  readonly status?: string;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
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

interface LocalSubscription {
  listeners: Set<NotificationListener>;
  lastSequenceByListener: Map<NotificationListener, number>;
}

export class RedisNotificationBus implements NotificationBus {
  readonly kind = "redis" as const;
  private readonly publisher: RedisPubSubClient;
  private readonly subscriber: RedisPubSubClient;
  private readonly subscriptions = new Map<string, LocalSubscription>();
  private closed = false;

  constructor(url: string, factory: RedisClientFactory = createRedisClient) {
    if (!url.trim()) throw new Error("A Redis Pub/Sub URL is required.");
    this.publisher = factory(url, "publisher");
    this.subscriber = factory(url, "subscriber");
    this.subscriber.on("message", this.onMessage);
  }

  async publish(event: NormalizedNotificationEvent): Promise<void> {
    if (this.closed) throw new Error("Notification bus is closed.");
    await this.publisher.publish(channelFor(event.userUuid), JSON.stringify(event));
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
        await this.subscriber.subscribe(channel);
      } catch (error) {
        this.subscriptions.delete(channel);
        throw error;
      }
    }
    subscription.listeners.add(listener);
    subscription.lastSequenceByListener.set(listener, options.lastSequence ?? 0);
    let active = true;
    return async () => {
      if (!active) return;
      active = false;
      const current = this.subscriptions.get(channel);
      if (!current) return;
      current.listeners.delete(listener);
      current.lastSequenceByListener.delete(listener);
      if (current.listeners.size === 0) {
        this.subscriptions.delete(channel);
        await this.subscriber.unsubscribe(channel);
      }
    };
  }

  async health(): Promise<NotificationBusHealth> {
    try {
      await Promise.all([this.publisher.ping(), this.subscriber.ping()]);
      return {
        kind: this.kind,
        ready: true,
        publisher: this.publisher.status ?? "ready",
        subscriber: this.subscriber.status ?? "ready",
      };
    } catch {
      return {
        kind: this.kind,
        ready: false,
        publisher: this.publisher.status ?? "unavailable",
        subscriber: this.subscriber.status ?? "unavailable",
      };
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.subscriber.off("message", this.onMessage);
    this.subscriptions.clear();
    await Promise.allSettled([this.subscriber.quit(), this.publisher.quit()]);
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
      const lastSequence = subscription.lastSequenceByListener.get(listener) ?? 0;
      if (parsed.sequence <= lastSequence) continue;
      subscription.lastSequenceByListener.set(listener, parsed.sequence);
      void Promise.resolve(listener(parsed)).catch(() => undefined);
    }
  };
}

