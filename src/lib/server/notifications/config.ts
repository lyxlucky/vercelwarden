export type NotificationsMode = "poll" | "sse" | "websocket";
export type NotificationBrokerKind = "memory" | "redis";

export interface NotificationEnvironment {
  [key: string]: string | undefined;
  NODE_ENV?: string;
  NOTIFICATIONS_MODE?: string;
  NOTIFICATIONS_REDIS_URL?: string;
  VERCEL_WEBSOCKET_ENABLED?: string;
}

export interface NotificationConfiguration {
  requestedMode: NotificationsMode;
  effectiveMode: NotificationsMode;
  broker: NotificationBrokerKind;
  brokerConfigured: boolean;
  websocketRuntimeConfigured: boolean;
  websocketReady: boolean;
  issues: string[];
  maxDurationSeconds: number;
  fallbacks: {
    sse: true;
    poll: true;
    pollSeconds: 45;
  };
}

export const NOTIFICATION_WEBSOCKET_MAX_DURATION_SECONDS = 300;

function configured(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function notificationMode(value: string | undefined): NotificationsMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "sse" || normalized === "websocket") return normalized;
  return "poll";
}

export function buildNotificationConfiguration(
  env: NotificationEnvironment = process.env
): NotificationConfiguration {
  const requestedMode = notificationMode(env.NOTIFICATIONS_MODE);
  const production = env.NODE_ENV === "production";
  const brokerConfigured = Boolean(env.NOTIFICATIONS_REDIS_URL?.trim());
  const websocketRuntimeConfigured = !production || configured(env.VERCEL_WEBSOCKET_ENABLED);
  const issues: string[] = [];

  if (requestedMode === "websocket" && production && !brokerConfigured) {
    issues.push("NOTIFICATIONS_REDIS_URL is required for production WebSocket notifications.");
  }
  if (requestedMode === "websocket" && !websocketRuntimeConfigured) {
    issues.push("VERCEL_WEBSOCKET_ENABLED=true is required after enabling Vercel Fluid Compute.");
  }

  const websocketReady = requestedMode === "websocket" && issues.length === 0;
  return {
    requestedMode,
    effectiveMode: requestedMode === "websocket" && !websocketReady ? "poll" : requestedMode,
    broker: brokerConfigured ? "redis" : "memory",
    brokerConfigured,
    websocketRuntimeConfigured,
    websocketReady,
    issues,
    maxDurationSeconds: NOTIFICATION_WEBSOCKET_MAX_DURATION_SECONDS,
    fallbacks: { sse: true, poll: true, pollSeconds: 45 },
  };
}

export function assertWebSocketNotificationsReady(
  env: NotificationEnvironment = process.env
): NotificationConfiguration {
  const configuration = buildNotificationConfiguration(env);
  if (!configuration.websocketReady) {
    const detail = configuration.issues.join(" ") || "NOTIFICATIONS_MODE=websocket is required.";
    throw new Error(`WebSocket notifications are unavailable. ${detail}`);
  }
  return configuration;
}

