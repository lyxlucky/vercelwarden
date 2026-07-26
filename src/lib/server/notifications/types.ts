import type { MutationNotification } from "@/lib/server/mutations/commit";

export interface NormalizedNotificationEvent {
  eventId: string;
  userUuid: string;
  type: string;
  revisionDate: string;
  sequence: number;
  resourceId?: string;
  actingDeviceIdentifier?: string;
  publishedAt: string;
}

export type NotificationEvent = Omit<NormalizedNotificationEvent, "userUuid" | "publishedAt">;
export type NotificationListener = (event: NormalizedNotificationEvent) => void | Promise<void>;
export type NotificationUnsubscribe = () => void | Promise<void>;

export interface NotificationSubscriptionOptions {
  lastSequence?: number;
}

export interface NotificationBusHealth {
  kind: "memory" | "redis";
  ready: boolean;
  publisher: string;
  subscriber: string;
}

export interface NotificationBus {
  readonly kind: NotificationBusHealth["kind"];
  publish(event: NormalizedNotificationEvent): Promise<void>;
  subscribe(
    userUuid: string,
    listener: NotificationListener,
    options?: NotificationSubscriptionOptions
  ): Promise<NotificationUnsubscribe>;
  health(): Promise<NotificationBusHealth>;
  close(): Promise<void>;
}

export function normalizeMutationNotification(
  event: MutationNotification,
  now = new Date()
): NormalizedNotificationEvent {
  return {
    eventId: String(event.sequence),
    userUuid: event.userUuid,
    type: event.resourceKind,
    revisionDate: event.revisionDate.toISOString(),
    sequence: event.sequence,
    resourceId: event.resourceId,
    actingDeviceIdentifier: event.actingDeviceIdentifier,
    publishedAt: now.toISOString(),
  };
}

export function publicNotificationEvent(event: NormalizedNotificationEvent): NotificationEvent {
  return {
    eventId: event.eventId,
    type: event.type,
    revisionDate: event.revisionDate,
    sequence: event.sequence,
    resourceId: event.resourceId,
    actingDeviceIdentifier: event.actingDeviceIdentifier,
  };
}

export function isNormalizedNotificationEvent(value: unknown): value is NormalizedNotificationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<NormalizedNotificationEvent>;
  return typeof event.eventId === "string"
    && typeof event.userUuid === "string"
    && typeof event.type === "string"
    && typeof event.revisionDate === "string"
    && Number.isSafeInteger(event.sequence)
    && Number(event.sequence) >= 0
    && typeof event.publishedAt === "string";
}

