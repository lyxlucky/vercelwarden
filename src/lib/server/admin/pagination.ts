import "server-only";

import { ApiError } from "@/lib/server/http/errors";

export interface AdminUserCursor { createdAt: string; id: string }

export function encodeAdminUserCursor(cursor: AdminUserCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeAdminUserCursor(value: string | null): AdminUserCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AdminUserCursor;
    if (!parsed.id || !parsed.createdAt || Number.isNaN(new Date(parsed.createdAt).getTime())) {
      throw new Error("invalid cursor");
    }
    return parsed;
  } catch {
    throw new ApiError(400, "invalid_cursor", "The pagination cursor is invalid.");
  }
}
