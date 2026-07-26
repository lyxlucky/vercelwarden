import "server-only";

import type { NotificationEnvironment } from "@/lib/server/notifications/config";
import { buildNotificationConfiguration } from "@/lib/server/notifications/config";
import type { NotificationBus } from "@/lib/server/notifications/types";
import { MemoryNotificationBus } from "@/lib/server/notifications/memory-bus";
import { RedisNotificationBus, type RedisClientFactory } from "@/lib/server/notifications/redis-bus";

type NotificationGlobal = typeof globalThis & {
  __vercelwardenNotificationBus?: NotificationBus;
};

const notificationGlobal = globalThis as NotificationGlobal;

const MAX_REPLAY_WINDOW_MS = 300_000;

// Parse an explicit NOTIFICATIONS_REPLAY_WINDOW_MS override. Returns undefined
// when unset/invalid so RedisNotificationBus applies its own default (the single
// source of truth for the default window). 0 disables replay.
function parseReplayWindowMs(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(Math.trunc(parsed), 0), MAX_REPLAY_WINDOW_MS);
}

export function createNotificationBus(
  env: NotificationEnvironment = process.env,
  redisFactory?: RedisClientFactory
): NotificationBus {
  const configuration = buildNotificationConfiguration(env);
  if (configuration.broker === "redis") {
    return new RedisNotificationBus(env.NOTIFICATIONS_REDIS_URL!, redisFactory, {
      replayWindowMs: parseReplayWindowMs(env.NOTIFICATIONS_REPLAY_WINDOW_MS),
    });
  }
  return new MemoryNotificationBus();
}

export function notificationBus(): NotificationBus {
  return notificationGlobal.__vercelwardenNotificationBus ??= createNotificationBus();
}

export async function resetNotificationBusForTests(): Promise<void> {
  await notificationGlobal.__vercelwardenNotificationBus?.close();
  delete notificationGlobal.__vercelwardenNotificationBus;
}

