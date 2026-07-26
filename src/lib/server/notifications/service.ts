import "server-only";

import type { MutationNotification } from "@/lib/server/mutations/commit";
import { notificationBus } from "@/lib/server/notifications/factory";
import type {
  NormalizedNotificationEvent,
  NotificationEvent,
  NotificationListener,
  NotificationUnsubscribe,
} from "@/lib/server/notifications/types";
import {
  normalizeMutationNotification,
  publicNotificationEvent,
} from "@/lib/server/notifications/types";

export type { NormalizedNotificationEvent, NotificationEvent } from "@/lib/server/notifications/types";

export async function publishNotification(event: MutationNotification): Promise<void> {
  await notificationBus().publish(normalizeMutationNotification(event));
}

export async function subscribeNotificationEvents(
  userUuid: string,
  listener: NotificationListener,
  lastSequence = 0
): Promise<NotificationUnsubscribe> {
  return notificationBus().subscribe(userUuid, listener, { lastSequence });
}

export async function subscribeNotifications(
  userUuid: string,
  listener: (event: NotificationEvent) => void | Promise<void>,
  lastSequence = 0
): Promise<NotificationUnsubscribe> {
  return subscribeNotificationEvents(
    userUuid,
    (event: NormalizedNotificationEvent) => listener(publicNotificationEvent(event)),
    lastSequence
  );
}

export async function notificationBusHealth() {
  return notificationBus().health();
}
