import "server-only";

import { redactNotificationMetadata } from "@/lib/server/notifications/redaction";

export type NotificationMetric =
  | "negotiation_attempt"
  | "connection_open"
  | "connection_close"
  | "protocol_failure"
  | "broker_publish_failure"
  | "broker_subscribe_failure"
  | "delivery"
  | "queue_overflow";

interface NotificationOperationalState {
  counters: Map<NotificationMetric, number>;
  activeSessions: number;
  lastFailure: { metric: NotificationMetric; at: string; detail?: string } | null;
}

const operationalGlobal = globalThis as typeof globalThis & {
  __vercelwardenNotificationOperationalState?: NotificationOperationalState;
};

const state = operationalGlobal.__vercelwardenNotificationOperationalState ??= {
  counters: new Map(),
  activeSessions: 0,
  lastFailure: null,
};

export function recordNotificationMetric(
  metric: NotificationMetric,
  metadata: Record<string, unknown> = {},
  level: "info" | "warn" = "info"
): void {
  state.counters.set(metric, (state.counters.get(metric) ?? 0) + 1);
  if (metric.endsWith("failure") || metric === "queue_overflow") {
    state.lastFailure = {
      metric,
      at: new Date().toISOString(),
      detail: typeof metadata.detail === "string" ? metadata.detail.slice(0, 200) : undefined,
    };
  }
  const payload = JSON.stringify({
    scope: "notifications",
    metric,
    ...redactNotificationMetadata(metadata),
  });
  console[level](payload);
}

export function notificationSessionOpened(metadata: Record<string, unknown> = {}): void {
  state.activeSessions += 1;
  recordNotificationMetric("connection_open", metadata);
}

export function notificationSessionClosed(metadata: Record<string, unknown> = {}): void {
  state.activeSessions = Math.max(0, state.activeSessions - 1);
  recordNotificationMetric("connection_close", metadata);
}

export function notificationOperationalSnapshot() {
  return {
    activeSessions: state.activeSessions,
    counters: Object.fromEntries(state.counters),
    lastFailure: state.lastFailure,
  };
}

