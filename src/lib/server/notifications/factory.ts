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

export function createNotificationBus(
  env: NotificationEnvironment = process.env,
  redisFactory?: RedisClientFactory
): NotificationBus {
  const configuration = buildNotificationConfiguration(env);
  if (configuration.broker === "redis") {
    return new RedisNotificationBus(env.NOTIFICATIONS_REDIS_URL!, redisFactory);
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

