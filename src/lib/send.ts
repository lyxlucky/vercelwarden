import type { sends } from "@/db/schema";
import { safeJsonParse } from "@/lib/cipher";

export function serializeSend(send: typeof sends.$inferSelect) {
  const data = safeJsonParse<Record<string, unknown>>(send.data) ?? {};
  return {
    Id: send.uuid,
    AccessId: send.uuid,
    Type: send.type,
    Name: send.name,
    Notes: send.notes,
    Key: send.key,
    Text: send.type === 0 ? data : null,
    File: send.type === 1 ? data : null,
    MaxAccessCount: send.maxAccessCount,
    AccessCount: send.accessCount,
    Password: send.password ? "********" : null,
    Disabled: send.disabled,
    HideEmail: send.hideEmail,
    RevisionDate: send.updatedAt.toISOString(),
    ExpirationDate: send.expirationDate?.toISOString() ?? null,
    DeletionDate: send.deletionDate.toISOString(),
    Object: "send",
  };
}
