import type { sendFiles, sends } from "@/db/schema";
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

// Inverse of accessIdFromUuid — decode a base64url accessId (no padding) into
// the canonical 8-4-4-4-12 lowercased UUID string used by `sends.uuid`. Returns
// null when the input isn't a 22-char base64url string of exactly 16 bytes.
export function uuidFromAccessId(accessId: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(accessId)) return null;
  const b64 = accessId.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  let buf: Buffer;
  try {
    buf = Buffer.from(b64 + pad, "base64");
  } catch {
    return null;
  }
  if (buf.length !== 16) return null;
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Send response — Vaultwarden Send::to_json (db/models/send.rs:140). Fully camelCase.
// `size` inside data must be a STRING (mobile clients expect that).
function serializedFile(file: typeof sendFiles.$inferSelect | null | undefined) {
  if (!file || file.status !== "complete") return null;
  return {
    id: file.uuid,
    fileName: file.fileName,
    // Display the PLAINTEXT size for new raw-binary Sends; fall back to the
    // encrypted size for legacy / official-client Sends (plaintextSize NULL).
    // The private streaming download route keeps using the real blob size for
    // Content-Length, so integrity is unaffected.
    size: String(file.plaintextSize ?? file.fileSize),
    sizeName: null,
    key: file.key,
    checksum: file.checksum,
    // Lets the public client pick raw-binary vs legacy base64 decode.
    plaintextSize: file.plaintextSize,
  };
}

export function serializeSend(send: typeof sends.$inferSelect, file?: typeof sendFiles.$inferSelect | null) {
  const data = safeJsonParse<Record<string, unknown>>(send.data) ?? {};
  if (typeof data.size === "number") {
    data.size = String(data.size);
  }

  return {
    id: send.uuid,
    accessId: accessIdFromUuid(send.uuid),
    type: send.type,

    name: send.name,
    notes: send.notes,
    text: send.type === 0 ? data : null,
    file: send.type === 1 ? serializedFile(file) ?? data : null,

    key: send.key,
    maxAccessCount: send.maxAccessCount,
    accessCount: send.accessCount,
    password: send.password ? "protected" : null,
    emails: null,
    // Bitwarden Send auth types: 0 = email, 1 = password, 2 = none.
    // Reporting unrestricted Sends as email-authenticated makes official
    // clients treat the response as an incomplete email-verification Send.
    authType: send.password ? 1 : 2,
    disabled: send.disabled,
    hideEmail: send.hideEmail,

    revisionDate: send.updatedAt.toISOString(),
    expirationDate: send.expirationDate?.toISOString() ?? null,
    deletionDate: send.deletionDate.toISOString(),
    object: "send",
  };
}

// Public access response — Vaultwarden Send::to_json_access (send.rs:173).
export function serializeSendAccess(
  send: typeof sends.$inferSelect,
  creatorIdentifier: string | null,
  file?: typeof sendFiles.$inferSelect | null,
  download?: { token: string; expiresAt: Date } | null
) {
  const data = safeJsonParse<Record<string, unknown>>(send.data) ?? {};
  if (typeof data.size === "number") {
    data.size = String(data.size);
  }
  return {
    id: send.uuid,
    type: send.type,
    name: send.name,
    text: send.type === 0 ? data : null,
    file: send.type === 1
      ? {
          ...(serializedFile(file) ?? data),
          ...(download ? { downloadToken: download.token, downloadExpiresAt: download.expiresAt.toISOString() } : {}),
        }
      : null,
    expirationDate: send.expirationDate?.toISOString() ?? null,
    creatorIdentifier,
    object: "send-access",
  };
}
