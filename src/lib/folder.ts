import type { folders } from "@/db/schema";

// Folder response — Vaultwarden Folder::to_json (db/models/folder.rs:44).
// All camelCase.
export function serializeFolder(folder: typeof folders.$inferSelect) {
  return {
    id: folder.uuid,
    revisionDate: folder.updatedAt.toISOString(),
    name: folder.name,
    object: "folder",
  };
}
