import type {
  NormalizedNotificationEvent,
  NotificationBus,
  NotificationBusHealth,
  NotificationListener,
  NotificationSubscriptionOptions,
  NotificationUnsubscribe,
} from "@/lib/server/notifications/types";

interface MemoryNotificationState {
  history: Map<string, NormalizedNotificationEvent[]>;
  listeners: Map<string, Set<NotificationListener>>;
}

export class MemoryNotificationBus implements NotificationBus {
  readonly kind = "memory" as const;

  constructor(
    private readonly state: MemoryNotificationState = {
      history: new Map(),
      listeners: new Map(),
    },
    private readonly maxHistoryPerUser = 100
  ) {}

  async publish(event: NormalizedNotificationEvent): Promise<void> {
    const history = this.state.history.get(event.userUuid) ?? [];
    if (history.some((candidate) => candidate.sequence === event.sequence)) return;
    history.push(event);
    history.sort((left, right) => left.sequence - right.sequence);
    if (history.length > this.maxHistoryPerUser) {
      history.splice(0, history.length - this.maxHistoryPerUser);
    }
    this.state.history.set(event.userUuid, history);
    for (const listener of this.state.listeners.get(event.userUuid) ?? []) {
      await listener(event);
    }
  }

  async subscribe(
    userUuid: string,
    listener: NotificationListener,
    options: NotificationSubscriptionOptions = {}
  ): Promise<NotificationUnsubscribe> {
    const lastSequence = options.lastSequence ?? 0;
    for (const event of this.state.history.get(userUuid) ?? []) {
      if (event.sequence > lastSequence) await listener(event);
    }
    const listeners = this.state.listeners.get(userUuid) ?? new Set<NotificationListener>();
    listeners.add(listener);
    this.state.listeners.set(userUuid, listeners);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
      if (listeners.size === 0) this.state.listeners.delete(userUuid);
    };
  }

  async health(): Promise<NotificationBusHealth> {
    return { kind: this.kind, ready: true, publisher: "ready", subscriber: "ready" };
  }

  async close(): Promise<void> {
    this.state.listeners.clear();
  }

  listenerCount(userUuid: string): number {
    return this.state.listeners.get(userUuid)?.size ?? 0;
  }
}

