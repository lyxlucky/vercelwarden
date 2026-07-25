import "server-only";

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { newUuid } from "@/lib/auth";

const SENSITIVE_KEY = /(password|secret|token|otp|key|cipher|content|authorization|cookie)/iu;

export type AuditCategory = "authentication" | "security" | "device" | "user" | "backup" | "system";
export type AuditLevel = "info" | "warning" | "critical";
export type AuditOutcome = "succeeded" | "failed" | "denied" | "partial";
export type AuditMetadataValue = string | number | boolean | null | string[];

export interface AuditEventInput {
  actorUserUuid?: string | null;
  actorEmailSnapshot?: string | null;
  action: string;
  category: AuditCategory;
  level?: AuditLevel;
  targetType?: string | null;
  targetId?: string | null;
  outcome: AuditOutcome;
  requestId?: string | null;
  ipPrefix?: string | null;
  metadata?: Record<string, unknown>;
  allowedMetadata?: readonly string[];
  createdAt?: Date;
}

function sanitizeValue(value: unknown): AuditMetadataValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value.slice(0, 50).map((entry) => entry.slice(0, 200));
  }
  return undefined;
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
  allowedKeys: readonly string[] = []
): Record<string, AuditMetadataValue> {
  if (!metadata || allowedKeys.length === 0) return {};
  const allowed = new Set(allowedKeys);
  const sanitized: Record<string, AuditMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowed.has(key) || SENSITIVE_KEY.test(key)) continue;
    const safeValue = sanitizeValue(value);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  }
  return sanitized;
}

export function buildAuditEvent(input: AuditEventInput) {
  return {
    uuid: newUuid(),
    actorUserUuid: input.actorUserUuid ?? null,
    actorEmailSnapshot: input.actorEmailSnapshot?.slice(0, 320) ?? null,
    action: input.action.slice(0, 120),
    category: input.category,
    level: input.level ?? "info",
    targetType: input.targetType?.slice(0, 80) ?? null,
    targetId: input.targetId?.slice(0, 200) ?? null,
    outcome: input.outcome,
    requestId: input.requestId?.slice(0, 200) ?? null,
    ipPrefix: input.ipPrefix?.slice(0, 80) ?? null,
    metadata: JSON.stringify(sanitizeAuditMetadata(input.metadata, input.allowedMetadata)),
    createdAt: input.createdAt ?? new Date(),
  } satisfies typeof auditEvents.$inferInsert;
}

export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  await db.insert(auditEvents).values(buildAuditEvent(input));
}

export function selectAuditEventsToDelete(
  events: Array<{ id: string; createdAt: Date }>,
  settings: { retentionDays: number | null; maxEntries: number | null },
  now = new Date()
): string[] {
  const deleted = new Set<string>();
  if (settings.retentionDays !== null) {
    const cutoff = now.getTime() - settings.retentionDays * 86_400_000;
    for (const event of events) if (event.createdAt.getTime() < cutoff) deleted.add(event.id);
  }
  if (settings.maxEntries !== null) {
    const retained = events
      .filter((event) => !deleted.has(event.id))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    for (const event of retained.slice(settings.maxEntries)) deleted.add(event.id);
  }
  return [...deleted];
}

export async function applyAuditRetention(
  settings: { retentionDays: number | null; maxEntries: number | null }
): Promise<number> {
  const rows = await db.select({ id: auditEvents.uuid, createdAt: auditEvents.createdAt }).from(auditEvents);
  const ids = selectAuditEventsToDelete(rows, settings);
  for (let offset = 0; offset < ids.length; offset += 500) {
    await db.delete(auditEvents).where(inArray(auditEvents.uuid, ids.slice(offset, offset + 500)));
  }
  return ids.length;
}
