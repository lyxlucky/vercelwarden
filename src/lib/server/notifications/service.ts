import "server-only";

import type { MutationNotification } from "@/lib/server/mutations/commit";

export interface NotificationEvent {
  eventId: string;
  type: string;
  revisionDate: string;
  sequence: number;
  resourceId?: string;
  actingDeviceIdentifier?: string;
}

interface NotificationState {
  history: Map<string, NotificationEvent[]>;
  listeners: Map<string, Set<(event: NotificationEvent) => void>>;
}

const globalState = globalThis as typeof globalThis & { __vercelwardenNotifications?: NotificationState };
const state = globalState.__vercelwardenNotifications ??= {
  history: new Map(),
  listeners: new Map(),
};
const MAX_HISTORY_PER_USER = 100;

function publicEvent(event: MutationNotification): NotificationEvent {
  return {
    eventId: String(event.sequence),
    type: event.resourceKind,
    revisionDate: event.revisionDate.toISOString(),
    sequence: event.sequence,
    resourceId: event.resourceId,
    actingDeviceIdentifier: event.actingDeviceIdentifier,
  };
}

export function publishNotification(event: MutationNotification): void {
  const notification = publicEvent(event);
  const history = state.history.get(event.userUuid) ?? [];
  history.push(notification);
  if (history.length > MAX_HISTORY_PER_USER) history.splice(0, history.length - MAX_HISTORY_PER_USER);
  state.history.set(event.userUuid, history);
  for (const listener of state.listeners.get(event.userUuid) ?? []) listener(notification);
}

export function subscribeNotifications(
  userUuid: string,
  listener: (event: NotificationEvent) => void,
  lastSequence = 0
): () => void {
  for (const event of state.history.get(userUuid) ?? []) {
    if (event.sequence > lastSequence) listener(event);
  }
  const listeners = state.listeners.get(userUuid) ?? new Set();
  listeners.add(listener);
  state.listeners.set(userUuid, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) state.listeners.delete(userUuid);
  };
}
