"use client";

import { apiClient } from "@/lib/client/api/client";
import { encryptWithUserKey, wipeBytes } from "@/lib/client/crypto/auth";
import { authSecretStore } from "@/features/auth/secret-store";
import { encodeVaultItem, transformVaultItemStrings } from "@/features/vault/item-codecs";
import { refreshVaultFromServer } from "@/features/vault/api";
import { vaultStore } from "@/features/vault/store";
import type { ImportDocument } from "@/features/import-export/import-registry";

export type FolderStrategy = "preserve" | "merge" | "flatten";

export interface ImportResult {
  object: "importResult";
  status: "completed";
  imported: number;
  failed: number;
  foldersCreated: number;
  folderMap: Record<string, string>;
  itemMap: Record<string, string>;
  outcomes: Array<{ sourceId: string; id: string; status: "imported" }>;
}

function normalized(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export async function importVaultDocument(document: ImportDocument, folderStrategy: FolderStrategy) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  const encoder = new TextEncoder();
  try {
    const existingFolders = vaultStore.getSnapshot().folders;
    const existingByName = new Map(existingFolders.map((folder) => [normalized(folder.name), folder.id]));
    const folders = await Promise.all(document.folders.map(async (folder) => ({
      sourceId: folder.id,
      name: await encryptWithUserKey(encoder.encode(folder.name), vaultKey),
      targetId: folderStrategy === "merge" ? existingByName.get(normalized(folder.name)) ?? null : null,
    })));
    const ciphers = await Promise.all(document.items.map(async (item, index) => {
      const encrypted = await transformVaultItemStrings({ ...item, id: undefined, folderId: null }, async (value) =>
        value ? encryptWithUserKey(encoder.encode(value), vaultKey) : ""
      );
      return {
        sourceId: item.id ?? `item-${index + 1}`,
        folderSourceId: folderStrategy === "flatten" ? null : item.folderId,
        payload: encodeVaultItem(encrypted),
      };
    }));
    const result = await apiClient<ImportResult>("/api/ciphers/import", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { folderStrategy, folders, ciphers },
    });
    await refreshVaultFromServer();
    return result;
  } finally {
    wipeBytes(vaultKey);
  }
}
