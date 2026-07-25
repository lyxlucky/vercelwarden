"use client";

import { useSyncExternalStore } from "react";
import type { VaultItemDraft } from "@/features/vault/item-codecs";

export type VaultSort = "name" | "created-desc" | "updated-desc";
export type DuplicateDetectionMode = "exact" | "login-site" | "login-credentials" | "password";
export type VaultFilter =
  | { kind: "all"; type?: number }
  | { kind: "favorites"; type?: number }
  | { kind: "folder"; folderId: string; type?: number }
  | { kind: "type"; type: number }
  | { kind: "archive"; type?: number }
  | { kind: "trash"; type?: number }
  | { kind: "duplicates"; mode: DuplicateDetectionMode; type?: number };

export interface VaultCustomFieldView {
  name: string;
  value: string;
}

export interface VaultItemView {
  id: string;
  type: number;
  name: string;
  notes?: string | null;
  username: string;
  password: string;
  uris: string[];
  customFields: VaultCustomFieldView[];
  details: VaultCustomFieldView[];
  attachments: Array<{ id: string; fileName: string; size: number }>;
  passwordHistory: Array<{ password: string; lastUsedDate: string | null }>;
  folderId: string | null;
  favorite: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reprompt?: number;
  raw?: Record<string, unknown>;
  draft?: VaultItemDraft;
}

export interface VaultFolderView {
  id: string;
  name: string;
}

export interface VaultSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  items: VaultItemView[];
  folders: VaultFolderView[];
  error: string | null;
  refreshedAt: number | null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function normalized(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().toLocaleLowerCase() : "";
}

function isActive(item: VaultItemView): boolean {
  return !item.archivedAt && !item.deletedAt;
}

function matchesType(item: VaultItemView, filter: VaultFilter): boolean {
  return filter.type == null || item.type === filter.type;
}

function matchesFilter(item: VaultItemView, filter: VaultFilter): boolean {
  if (!matchesType(item, filter)) return false;
  if (filter.kind === "archive") return Boolean(item.archivedAt) && !item.deletedAt;
  if (filter.kind === "trash") return Boolean(item.deletedAt);
  if (!isActive(item)) return false;
  if (filter.kind === "favorites") return item.favorite;
  if (filter.kind === "folder") return item.folderId === filter.folderId;
  return true;
}

function searchDocument(item: VaultItemView): string {
  return [
    item.name,
    item.username,
    ...item.uris,
    ...item.customFields.flatMap((field) => [field.name, field.value]),
  ].map(normalized).join("\n");
}

function duplicateSite(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    const parsed = new URL(/^\w+:\/\//.test(value) ? value : `https://${value}`);
    return parsed.hostname.toLocaleLowerCase().replace(/^www\./, "");
  } catch {
    return normalized(value).replace(/^www\./, "").split(/[/?#]/, 1)[0] ?? "";
  }
}

function exactSignature(item: VaultItemView): string {
  return JSON.stringify({
    type: item.type,
    folderId: item.folderId,
    favorite: item.favorite,
    reprompt: item.reprompt ?? 0,
    name: item.name,
    notes: item.notes ?? null,
    username: item.username,
    password: item.password,
    uris: item.uris,
    customFields: item.customFields,
  });
}

function duplicateSignatures(item: VaultItemView, mode: DuplicateDetectionMode): string[] {
  if (mode === "exact") return [exactSignature(item)];
  if (item.type !== 1) return [];
  const username = normalized(item.username);
  const password = item.password;
  if (mode === "password") return password ? [JSON.stringify(["password", password])] : [];
  if (!username || !password) return [];
  if (mode === "login-credentials") return [JSON.stringify(["login-credentials", username, password])];
  return Array.from(new Set(item.uris.map(duplicateSite).filter(Boolean))).map((site) =>
    JSON.stringify(["login-site", site, username, password])
  );
}

export function groupDuplicateItems(
  items: readonly VaultItemView[],
  mode: DuplicateDetectionMode
): VaultItemView[][] {
  const groups = new Map<string, VaultItemView[]>();
  for (const item of items) {
    if (!isActive(item)) continue;
    for (const signature of duplicateSignatures(item, mode)) {
      const group = groups.get(signature) ?? [];
      group.push(item);
      groups.set(signature, group);
    }
  }
  const seenGroups = new Set<string>();
  return Array.from(groups.entries())
    .filter(([, group]) => group.length >= 2)
    .sort(([left], [right]) => collator.compare(left, right))
    .flatMap(([, group]) => {
      const ids = group.map((item) => item.id).sort().join("\0");
      if (seenGroups.has(ids)) return [];
      seenGroups.add(ids);
      return [[...group].sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id))];
    });
}

export function selectVaultItems(
  items: readonly VaultItemView[],
  input: { query: string; filter: VaultFilter; sort: VaultSort }
): VaultItemView[] {
  const duplicateIds = input.filter.kind === "duplicates"
    ? new Set(groupDuplicateItems(items, input.filter.mode).flat().map((item) => item.id))
    : null;
  const tokens = normalized(input.query).split(/\s+/).filter(Boolean);
  const selected = items.filter((item) => {
    if (!matchesFilter(item, input.filter)) return false;
    if (duplicateIds && !duplicateIds.has(item.id)) return false;
    const document = searchDocument(item);
    return tokens.every((token) => document.includes(token));
  });

  return selected.sort((left, right) => {
    if (input.sort === "created-desc") {
      const dateOrder = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      if (dateOrder) return dateOrder;
    }
    if (input.sort === "updated-desc") {
      const dateOrder = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (dateOrder) return dateOrder;
    }
    return collator.compare(left.name, right.name) || collator.compare(left.id, right.id);
  });
}

export function buildVaultCounts(items: readonly VaultItemView[], folderIds: readonly string[]) {
  const active = items.filter(isActive);
  const types: Record<number, number> = {};
  const folders = Object.fromEntries(folderIds.map((id) => [id, 0])) as Record<string, number>;
  for (const item of active) {
    types[item.type] = (types[item.type] ?? 0) + 1;
    if (item.folderId && item.folderId in folders) folders[item.folderId] += 1;
  }
  const duplicateIds = new Set<DuplicateDetectionMode>(["exact", "login-site", "login-credentials", "password"]);
  const duplicates = new Set<string>();
  for (const mode of duplicateIds) {
    for (const item of groupDuplicateItems(active, mode).flat()) duplicates.add(item.id);
  }
  return {
    all: active.length,
    favorites: active.filter((item) => item.favorite).length,
    archive: items.filter((item) => item.archivedAt && !item.deletedAt).length,
    trash: items.filter((item) => item.deletedAt).length,
    duplicates: duplicates.size,
    types,
    folders,
  };
}

let snapshot: VaultSnapshot = { status: "idle", items: [], folders: [], error: null, refreshedAt: null };
const listeners = new Set<() => void>();

function publish(next: VaultSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export const vaultStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => snapshot,
  setLoading() {
    publish({ ...snapshot, status: "loading", error: null });
  },
  replace(items: VaultItemView[], folders: VaultFolderView[]) {
    publish({ status: "ready", items, folders, error: null, refreshedAt: Date.now() });
  },
  mergeItem(item: VaultItemView) {
    const exists = snapshot.items.some((current) => current.id === item.id);
    publish({
      ...snapshot,
      status: "ready",
      items: exists
        ? snapshot.items.map((current) => current.id === item.id ? item : current)
        : [...snapshot.items, item],
      error: null,
      refreshedAt: Date.now(),
    });
  },
  setError(error: string) {
    publish({ ...snapshot, status: "error", error });
  },
  clear() {
    publish({ status: "idle", items: [], folders: [], error: null, refreshedAt: null });
  },
};

export function useVaultSnapshot() {
  return useSyncExternalStore(vaultStore.subscribe, vaultStore.getSnapshot, vaultStore.getServerSnapshot);
}
