import type { attachments } from "@/db/schema";

// Bitwarden client `getDisplaySize`-style human-readable size.
function displaySize(bytes: number): string {
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n % 1 === 0 ? n : n.toFixed(2)} ${units[i]}`;
}

// Attachment response — Vaultwarden Attachment::to_json (attachment.rs:68).
// camelCase; `size` is a STRING; `url` is absolute via the request origin.
export function serializeAttachment(
  attachment: typeof attachments.$inferSelect,
  cipherUuid: string,
  origin: string
) {
  return {
    id: attachment.uuid,
    url: `${origin}/api/ciphers/${cipherUuid}/attachment/${attachment.uuid}`,
    fileName: attachment.fileName,
    size: String(attachment.fileSize),
    sizeName: displaySize(attachment.fileSize),
    key: attachment.key,
    object: "attachment",
  };
}
