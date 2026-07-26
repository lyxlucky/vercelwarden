export const CAPABILITY_KEYS = [
  "cipher.extendedTypes",
  "cipher.archive",
  "cipher.optimisticConcurrency",
  "auth.totp",
  "auth.yubikey",
  "auth.twoFactorPasskey",
  "auth.accountPasskey",
  "auth.passkeyDirectUnlock",
  "device.management",
  "authRequests.approval",
  "domainRules.write",
  "vault.import",
  "vault.exportAttachments",
  "admin.users",
  "admin.invites",
  "admin.audit",
  "admin.backup",
  "pwa.offlineReadOnly",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type CapabilityMap = Record<CapabilityKey, boolean>;

export interface CapabilityEnvironment extends NotificationEnvironment {
  [key: string]: string | undefined;
  DISABLE_REGISTRATION?: string;
  REQUIRE_INVITE?: string;
  NOTIFICATIONS_MODE?: string;
  MAX_ATTACHMENT_BYTES?: string;
  MAX_SEND_FILE_BYTES?: string;
  MAX_IMPORT_BYTES?: string;
  MAX_IMPORT_ITEMS?: string;
  MAX_DECOMPRESSED_BYTES?: string;
  ENABLE_EXTENDED_CIPHERS?: string;
  ENABLE_CIPHER_ARCHIVE?: string;
  ENABLE_CIPHER_CONCURRENCY?: string;
  ENABLE_YUBIKEY?: string;
  ENABLE_TWO_FACTOR_PASSKEY?: string;
  ENABLE_ACCOUNT_PASSKEY?: string;
  ENABLE_PASSKEY_DIRECT_UNLOCK?: string;
  ENABLE_DEVICE_MANAGEMENT?: string;
  ENABLE_AUTH_REQUESTS?: string;
  ENABLE_DOMAIN_RULES_WRITE?: string;
  ENABLE_VAULT_IMPORT?: string;
  ENABLE_ATTACHMENT_EXPORT?: string;
  ENABLE_ADMIN_INVITES?: string;
  ENABLE_ADMIN_AUDIT?: string;
  ENABLE_ADMIN_BACKUP?: string;
  ENABLE_OFFLINE_VAULT?: string;
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

export function buildCapabilityDocument(env: CapabilityEnvironment = process.env) {
  const notificationConfiguration = buildNotificationConfiguration(env);
  const capabilities: CapabilityMap = {
    "cipher.extendedTypes": enabled(env.ENABLE_EXTENDED_CIPHERS),
    "cipher.archive": enabled(env.ENABLE_CIPHER_ARCHIVE),
    "cipher.optimisticConcurrency": enabled(env.ENABLE_CIPHER_CONCURRENCY),
    "auth.totp": true,
    "auth.yubikey": enabled(env.ENABLE_YUBIKEY),
    "auth.twoFactorPasskey": enabled(env.ENABLE_TWO_FACTOR_PASSKEY),
    "auth.accountPasskey": enabled(env.ENABLE_ACCOUNT_PASSKEY),
    "auth.passkeyDirectUnlock": enabled(env.ENABLE_PASSKEY_DIRECT_UNLOCK),
    "device.management": enabled(env.ENABLE_DEVICE_MANAGEMENT),
    "authRequests.approval": enabled(env.ENABLE_AUTH_REQUESTS),
    "domainRules.write": enabled(env.ENABLE_DOMAIN_RULES_WRITE),
    "vault.import": enabled(env.ENABLE_VAULT_IMPORT),
    "vault.exportAttachments": enabled(env.ENABLE_ATTACHMENT_EXPORT),
    "admin.users": true,
    "admin.invites": enabled(env.ENABLE_ADMIN_INVITES),
    "admin.audit": enabled(env.ENABLE_ADMIN_AUDIT),
    "admin.backup": enabled(env.ENABLE_ADMIN_BACKUP),
    "pwa.offlineReadOnly": enabled(env.ENABLE_OFFLINE_VAULT),
  };

  if (!capabilities["auth.accountPasskey"]) {
    capabilities["auth.passkeyDirectUnlock"] = false;
  }

  return {
    contractVersion: 1,
    schemaVersion: 1,
    registration: {
      enabled: !enabled(env.DISABLE_REGISTRATION),
      inviteRequired: enabled(env.REQUIRE_INVITE),
    },
    limits: {
      attachmentBytes: boundedInteger(env.MAX_ATTACHMENT_BYTES, 100 * 1024 * 1024, 1, 500 * 1024 * 1024),
      sendFileBytes: boundedInteger(env.MAX_SEND_FILE_BYTES, 100 * 1024 * 1024, 1, 500 * 1024 * 1024),
      importBytes: boundedInteger(env.MAX_IMPORT_BYTES, 500 * 1024 * 1024, 1, 1024 * 1024 * 1024),
      importItems: boundedInteger(env.MAX_IMPORT_ITEMS, 10_000, 1, 100_000),
      decompressedBytes: boundedInteger(
        env.MAX_DECOMPRESSED_BYTES,
        1024 * 1024 * 1024,
        1,
        2 * 1024 * 1024 * 1024
      ),
    },
    notifications: {
      mode: notificationConfiguration.effectiveMode,
      requestedMode: notificationConfiguration.requestedMode,
      status: notificationConfiguration.websocketReady || notificationConfiguration.requestedMode !== "websocket"
        ? "ready"
        : "degraded",
      transports: {
        websocket: notificationConfiguration.websocketReady,
        sse: notificationConfiguration.fallbacks.sse,
        poll: notificationConfiguration.fallbacks.poll,
      },
      pollFallbackSeconds: notificationConfiguration.fallbacks.pollSeconds,
      websocketMaxDurationSeconds: notificationConfiguration.maxDurationSeconds,
    },
    capabilities,
  } as const;
}
import {
  buildNotificationConfiguration,
  type NotificationEnvironment,
} from "@/lib/server/notifications/config";
