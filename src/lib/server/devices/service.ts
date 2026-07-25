import "server-only";
import { buildCapabilityDocument } from "@/lib/contracts/capabilities";
import { ApiError } from "@/lib/server/http/errors";

export type DeviceTrustState = "untrusted" | "trusted-temporary" | "trusted-permanent" | "revoked";

export function deviceTrustState(
  device: { trustedAt: Date | null; trustedUntil: Date | null; revokedAt: Date | null },
  now = new Date()
): DeviceTrustState {
  if (device.revokedAt) return "revoked";
  if (!device.trustedAt) return "untrusted";
  if (device.trustedUntil && device.trustedUntil.getTime() <= now.getTime()) return "untrusted";
  return device.trustedUntil ? "trusted-temporary" : "trusted-permanent";
}

export function assertDeviceActionAllowed(input: {
  action: "rename" | "trust" | "untrust" | "remove";
  targetIdentifier: string;
  currentIdentifier: string;
}): void {
  if (input.action === "remove" && input.targetIdentifier === input.currentIdentifier) {
    throw new ApiError(409, "current_device_protected", "The current device cannot remove itself.");
  }
}

export function assertDeviceManagementEnabled(): void {
  if (!buildCapabilityDocument().capabilities["device.management"]) {
    throw new ApiError(404, "not_found", "Device management is unavailable.");
  }
}

export function serializeDevice(device: {
  uuid: string;
  identifier: string;
  name: string;
  systemName: string | null;
  note: string | null;
  type: number;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
  trustedAt: Date | null;
  trustedUntil: Date | null;
  revokedAt: Date | null;
}, currentDeviceUuid: string, now = new Date()) {
  const lastSeenAt = device.lastSeenAt ?? device.updatedAt;
  return {
    id: device.uuid,
    identifier: device.identifier,
    name: device.name,
    systemName: device.systemName,
    note: device.note,
    type: device.type,
    creationDate: device.createdAt.toISOString(),
    revisionDate: device.updatedAt.toISOString(),
    lastSeenDate: lastSeenAt.toISOString(),
    online: now.getTime() - lastSeenAt.getTime() <= 5 * 60_000 && !device.revokedAt,
    trustState: deviceTrustState(device, now),
    trustedAt: device.trustedAt?.toISOString() ?? null,
    trustedUntil: device.trustedUntil?.toISOString() ?? null,
    revokedAt: device.revokedAt?.toISOString() ?? null,
    current: device.uuid === currentDeviceUuid,
    object: "device",
  };
}
