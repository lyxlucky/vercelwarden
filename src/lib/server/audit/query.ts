import { ApiError } from "@/lib/server/http/errors";

export const AUDIT_CATEGORIES = ["authentication", "security", "device", "user", "backup", "system"] as const;
export const AUDIT_LEVELS = ["info", "warning", "critical"] as const;
export const AUDIT_OUTCOMES = ["succeeded", "failed", "denied", "partial"] as const;

export interface AuditCursor {
  createdAt: string;
  id: string;
}

export interface AuditQuery {
  limit: number;
  cursor: AuditCursor | null;
  category: (typeof AUDIT_CATEGORIES)[number] | null;
  level: (typeof AUDIT_LEVELS)[number] | null;
  outcome: (typeof AUDIT_OUTCOMES)[number] | null;
  action: string | null;
  actor: string | null;
  target: string | null;
  from: Date | null;
  to: Date | null;
}

export function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeAuditCursor(value: string | null): AuditCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AuditCursor>;
    if (!parsed.id || typeof parsed.createdAt !== "string" || Number.isNaN(new Date(parsed.createdAt).getTime())) {
      throw new Error("invalid");
    }
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch {
    throw new ApiError(400, "invalid_cursor", "The audit cursor is invalid.");
  }
}

function parseEnum<T extends string>(params: URLSearchParams, key: string, values: readonly T[]): T | null {
  const value = params.get(key);
  if (!value) return null;
  if (!values.includes(value as T)) {
    throw new ApiError(400, "invalid_filter", `The audit ${key} filter is invalid.`);
  }
  return value as T;
}

function parseDate(params: URLSearchParams, key: string): Date | null {
  const value = params.get(key);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "invalid_filter", `The audit ${key} filter is invalid.`);
  }
  return date;
}

function boundedText(params: URLSearchParams, key: string, maxLength: number): string | null {
  const value = params.get(key)?.trim();
  return value ? value.slice(0, maxLength) : null;
}

export function parseAuditQuery(params: URLSearchParams): AuditQuery {
  const requestedLimit = Number(params.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit) || 50, 1), 200)
    : 50;
  const from = parseDate(params, "from");
  const to = parseDate(params, "to");
  if (from && to && from.getTime() > to.getTime()) {
    throw new ApiError(400, "invalid_filter", "The audit date range is invalid.");
  }
  return {
    limit,
    cursor: decodeAuditCursor(params.get("cursor")),
    category: parseEnum(params, "category", AUDIT_CATEGORIES),
    level: parseEnum(params, "level", AUDIT_LEVELS),
    outcome: parseEnum(params, "outcome", AUDIT_OUTCOMES),
    action: boundedText(params, "action", 120),
    actor: boundedText(params, "actor", 200),
    target: boundedText(params, "target", 200),
    from,
    to,
  };
}
