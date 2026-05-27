import type { sends } from "@/db/schema";
import { safeJsonParse } from "@/lib/cipher";

// Send.accessId is the UUID encoded as base64url without padding (16 raw
// bytes), per Vaultwarden Send::to_json.
function accessIdFromUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) return uuid;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Send response — Vaultwarden Send::to_json (db/models/send.rs:140). Fully camelCase.
// `size` inside data must be a STRING (mobile clients expect that).
export function serializeSend(send: typeof sends.$inferSelect) {
  const data = safeJsonParse<Record<string, unknown>>(send.data) ?? {};
  if (typeof data.size === "number") {
    data.size = String(data.size);
  }

  const passwordEncoded = send.password
    ? Buffer.from(send.password).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : null;

  return {
    id: send.uuid,
    accessId: accessIdFromUuid(send.uuid),
    type: send.type,

    name: send.name,
    notes: send.notes,
    text: send.type === 0 ? data : null,
    file: send.type === 1 ? data : null,

    key: send.key,
    maxAccessCount: send.maxAccessCount,
    accessCount: send.accessCount,
    password: passwordEncoded,
    authType: send.password ? 1 : 0,
    disabled: send.disabled,
    hideEmail: send.hideEmail,

    revisionDate: send.updatedAt.toISOString(),
    expirationDate: send.expirationDate?.toISOString() ?? null,
    deletionDate: send.deletionDate.toISOString(),
    object: "send",
  };
}

// Public access response — Vaultwarden Send::to_json_access (send.rs:173).
export function serializeSendAccess(send: typeof sends.$inferSelect, creatorIdentifier: string | null) {
  const data = safeJsonParse<Record<string, unknown>>(send.data) ?? {};
  if (typeof data.size === "number") {
    data.size = String(data.size);
  }
  return {
    id: send.uuid,
    type: send.type,
    name: send.name,
    text: send.type === 0 ? data : null,
    file: send.type === 1 ? data : null,
    expirationDate: send.expirationDate?.toISOString() ?? null,
    creatorIdentifier,
    object: "send-access",
  };
}
