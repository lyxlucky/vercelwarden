import "server-only";

import type { AuditEventInput, AuditOutcome } from "@/lib/server/audit/service";
import { writeAuditEvent } from "@/lib/server/audit/service";

const ACTIONS = {
  "authentication.password.login": { category: "authentication", level: "info", targetType: "user", allowedMetadata: ["deviceType"] },
  "authentication.passkey.login": { category: "authentication", level: "info", targetType: "user", allowedMetadata: ["directUnlock", "deviceType"] },
  "authentication.refresh": { category: "authentication", level: "info", targetType: "device", allowedMetadata: [] },
  "account.password.change": { category: "security", level: "critical", targetType: "user", allowedMetadata: [] },
  "account.kdf.change": { category: "security", level: "critical", targetType: "user", allowedMetadata: ["kdfType", "iterations"] },
  "account.api_key.reveal": { category: "security", level: "warning", targetType: "user", allowedMetadata: [] },
  "account.api_key.rotate": { category: "security", level: "critical", targetType: "user", allowedMetadata: [] },
  "device.remove": { category: "device", level: "critical", targetType: "device", allowedMetadata: ["identifier"] },
  "device.trust.revoke": { category: "device", level: "warning", targetType: "device", allowedMetadata: ["identifier"] },
  "device.trust.revoke_all": { category: "device", level: "warning", targetType: "device", allowedMetadata: ["count"] },
  "backup.destination.create": { category: "backup", level: "warning", targetType: "backupDestination", allowedMetadata: ["provider"] },
  "backup.destination.update": { category: "backup", level: "warning", targetType: "backupDestination", allowedMetadata: ["provider", "enabled"] },
  "backup.run.start": { category: "backup", level: "warning", targetType: "backupRun", allowedMetadata: ["trigger", "mode", "includeAttachments"] },
  "backup.run.finish": { category: "backup", level: "warning", targetType: "backupRun", allowedMetadata: ["status", "size", "count"] },
  "backup.artifact.delete": { category: "backup", level: "critical", targetType: "backupArtifact", allowedMetadata: [] },
  "backup.artifact.download": { category: "backup", level: "warning", targetType: "backupArtifact", allowedMetadata: ["size"] },
  "backup.restore": { category: "backup", level: "critical", targetType: "backupArtifact", allowedMetadata: ["mode", "status", "restored", "failed"] },
} as const satisfies Record<string, {
  category: AuditEventInput["category"];
  level: NonNullable<AuditEventInput["level"]>;
  targetType: string;
  allowedMetadata: readonly string[];
}>;

export type AuditAction = keyof typeof ACTIONS;

function requestIpPrefix(request: Pick<Request, "headers"> | undefined): string | null {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  if (!forwarded) return null;
  if (forwarded.includes(":")) return forwarded.split(":").slice(0, 4).join(":");
  const octets = forwarded.split(".");
  return octets.length === 4 ? `${octets.slice(0, 3).join(".")}.0/24` : null;
}

export function buildTypedAuditEvent(input: {
  action: AuditAction;
  actorUserUuid?: string | null;
  actorEmailSnapshot?: string | null;
  targetId?: string | null;
  outcome: AuditOutcome;
  request?: Pick<Request, "headers">;
  metadata?: Record<string, unknown>;
}): AuditEventInput {
  const definition = ACTIONS[input.action];
  return {
    actorUserUuid: input.actorUserUuid,
    actorEmailSnapshot: input.actorEmailSnapshot,
    action: input.action,
    category: definition.category,
    level: definition.level,
    targetType: definition.targetType,
    targetId: input.targetId,
    outcome: input.outcome,
    requestId: input.request?.headers.get("x-request-id"),
    ipPrefix: requestIpPrefix(input.request),
    metadata: input.metadata,
    allowedMetadata: definition.allowedMetadata,
  };
}

export async function recordAuditEvent(input: Parameters<typeof buildTypedAuditEvent>[0]): Promise<void> {
  try {
    await writeAuditEvent(buildTypedAuditEvent(input));
  } catch (error) {
    console.warn("Audit event write failed", error instanceof Error ? error.name : "unknown");
  }
}
