"use client";

import { apiClient } from "@/lib/client/api/client";
import {
  decryptTextWithUserKey,
  decryptWithUserKey,
  encryptWithUserKey,
  wipeBytes,
} from "@/lib/client/crypto/auth";
import { authSecretStore } from "@/features/auth/secret-store";
import { vaultStore, type VaultFolderView, type VaultItemView } from "@/features/vault/store";
import { vaultCache } from "@/lib/client/offline/vault-cache";
import { sessionStore } from "@/lib/client/state/session-store";
import {
  decodeVaultItem,
  encodeVaultItem,
  transformVaultItemStrings,
  type VaultItemDraft,
} from "@/features/vault/item-codecs";

export interface WireFolder {
  id: string;
  name: string;
}

interface WireField {
  name?: string | null;
  value?: string | null;
}

interface WireLoginUri {
  uri?: string | null;
}

interface WireLogin {
  username?: string | null;
  password?: string | null;
  uris?: WireLoginUri[] | null;
}

export interface WireCipher {
  id: string;
  type: number;
  name: string;
  notes?: string | null;
  key?: string | null;
  favorite?: boolean;
  folderId?: string | null;
  archivedDate?: string | null;
  deletedDate?: string | null;
  creationDate: string;
  revisionDate: string;
  reprompt?: number;
  fields?: WireField[] | null;
  attachments?: Array<{ id: string; fileName: string; size?: number; sizeName?: string }> | null;
  passwordHistory?: Array<{ password?: string | null; lastUsedDate?: string | null }> | null;
  login?: WireLogin | null;
  [key: string]: unknown;
}

export interface SyncResponse {
  object: "sync";
  ciphers: WireCipher[];
  folders: WireFolder[];
  profile?: {
    id?: string;
    email?: string;
    key?: string;
    privateKey?: string | null;
    [key: string]: unknown;
  };
  userDecryption?: {
    masterPasswordUnlock?: {
      kdf?: { kdfType?: number; iterations?: number; memory?: number; parallelism?: number };
      masterKeyEncryptedUserKey?: string;
      salt?: string;
    } | null;
  };
  revisionDate?: string;
  sequence?: number;
  [key: string]: unknown;
}

export interface BulkMutationResult {
  object: "bulkMutation";
  operation: string;
  succeeded: number;
  failed: number;
  outcomes: Array<{
    id: string;
    status: "succeeded" | "conflict" | "not_found" | "failed";
    code?: string;
    revisionDate?: string;
  }>;
}

function isEncrypted(value: string): boolean {
  return value.startsWith("2.");
}

async function decryptMaybe(value: string | null | undefined, key: Uint8Array | null): Promise<string> {
  if (!value) return "";
  if (!isEncrypted(value)) return value;
  if (!key) throw new Error("Vault key unavailable.");
  return decryptTextWithUserKey(value, key);
}

export async function itemView(cipher: WireCipher, vaultKey: Uint8Array | null): Promise<VaultItemView> {
  let itemKey: Uint8Array | null = null;
  try {
    if (cipher.key) {
      if (!vaultKey) throw new Error("Vault key unavailable.");
      itemKey = await decryptWithUserKey(cipher.key, vaultKey);
    }
    const key = itemKey ?? vaultKey;
    const draft = await transformVaultItemStrings(
      decodeVaultItem(cipher as Record<string, unknown>),
      (value) => decryptMaybe(value, key)
    );
    const fields = draft.fields.map((field) => ({ name: field.name, value: field.value }));
    const login = cipher.type === 1 ? draft.payload : {};
    const payload = draft.payload;
    const detailDefinitions = cipher.type === 3
      ? [["持卡人", "cardholderName"], ["卡号", "number"], ["品牌", "brand"], ["有效月份", "expMonth"], ["有效年份", "expYear"], ["安全码", "code"]]
      : cipher.type === 4
        ? [["姓名", "firstName"], ["姓氏", "lastName"], ["邮箱", "email"], ["电话", "phone"], ["地址", "address1"]]
        : cipher.type === 5
          ? [["私钥", "privateKey"], ["公钥", "publicKey"], ["指纹", "keyFingerprint"]]
          : cipher.type === 6
            ? [["银行", "bankName"], ["账户名", "accountHolderName"], ["账号", "accountNumber"], ["路由号码", "routingNumber"], ["IBAN", "iban"], ["SWIFT", "swift"]]
            : cipher.type === 7
              ? [["证件号", "licenseNumber"], ["姓名", "givenName"], ["姓氏", "familyName"], ["签发国家", "issuingCountry"], ["到期日", "expiryDate"]]
              : cipher.type === 8
                ? [["护照号", "passportNumber"], ["姓名", "givenName"], ["姓氏", "familyName"], ["国籍", "nationality"], ["到期日", "expiryDate"]]
                : [];
    const details = await Promise.all(detailDefinitions.flatMap(([label, field]) => {
      const value = payload[field];
      return typeof value === "string"
        ? [{ name: label, value: decryptMaybe(value, key) }]
        : [];
    }).map(async (detail) => ({ name: detail.name, value: await detail.value })));
    const attachments = await Promise.all((cipher.attachments ?? []).map(async (attachment) => ({
      id: attachment.id,
      fileName: await decryptMaybe(attachment.fileName, key),
      size: Number(attachment.size ?? 0),
    })));
    return {
      id: cipher.id,
      type: cipher.type,
      name: draft.name,
      notes: draft.notes,
      username: typeof login.username === "string" ? login.username : "",
      password: typeof login.password === "string" ? login.password : "",
      uris: Array.isArray(login.uris)
        ? login.uris.map((uri) => typeof uri === "object" && uri && typeof (uri as WireLoginUri).uri === "string" ? (uri as WireLoginUri).uri! : "").filter(Boolean)
        : [],
      customFields: fields,
      details,
      attachments,
      passwordHistory: draft.passwordHistory.map((entry) => ({ password: entry.password, lastUsedDate: entry.lastUsedDate })),
      folderId: cipher.folderId ?? null,
      favorite: Boolean(cipher.favorite),
      archivedAt: cipher.archivedDate ?? null,
      deletedAt: cipher.deletedDate ?? null,
      createdAt: cipher.creationDate,
      updatedAt: cipher.revisionDate,
      reprompt: cipher.reprompt ?? 0,
      raw: cipher,
      draft,
    };
  } catch {
    return {
      id: cipher.id,
      type: cipher.type,
      name: "[无法解密的项目]",
      notes: null,
      username: "",
      password: "",
      uris: [],
      customFields: [],
      details: [],
      attachments: [],
      passwordHistory: [],
      folderId: cipher.folderId ?? null,
      favorite: Boolean(cipher.favorite),
      archivedAt: cipher.archivedDate ?? null,
      deletedAt: cipher.deletedDate ?? null,
      createdAt: cipher.creationDate,
      updatedAt: cipher.revisionDate,
      reprompt: cipher.reprompt ?? 0,
    };
  } finally {
    wipeBytes(itemKey ?? undefined);
  }
}

export function validateSyncResponse(response: unknown): SyncResponse {
  if (!response || typeof response !== "object") throw new Error("The sync response is invalid.");
  const candidate = response as Partial<SyncResponse>;
  if (candidate.object !== "sync" || !Array.isArray(candidate.ciphers) || !Array.isArray(candidate.folders)) {
    throw new Error("The sync response is incomplete.");
  }
  for (const cipher of candidate.ciphers) {
    if (!cipher || typeof cipher !== "object" || typeof cipher.id !== "string" || typeof cipher.name !== "string") {
      throw new Error("The sync response contains an invalid cipher.");
    }
  }
  for (const folder of candidate.folders) {
    if (!folder || typeof folder !== "object" || typeof folder.id !== "string" || typeof folder.name !== "string") {
      throw new Error("The sync response contains an invalid folder.");
    }
  }
  return candidate as SyncResponse;
}

export async function materializeVaultSnapshot(
  response: SyncResponse,
  suppliedVaultKey?: Uint8Array | null
): Promise<{ items: VaultItemView[]; folders: VaultFolderView[] }> {
  const vaultKey = suppliedVaultKey?.slice() ?? authSecretStore.getVaultKey();
  try {
    const [items, folders] = await Promise.all([
      Promise.all(response.ciphers.map((cipher) => itemView(cipher, vaultKey))),
      Promise.all(response.folders.map(async (folder) => ({
        id: folder.id,
        name: await decryptMaybe(folder.name, vaultKey).catch(() => "[无法解密的文件夹]"),
      }))),
    ]);
    return { items, folders };
  } finally {
    wipeBytes(vaultKey ?? undefined);
  }
}

async function persistEncryptedSnapshot(response: SyncResponse) {
  const session = sessionStore.getSnapshot();
  const unlock = response.userDecryption?.masterPasswordUnlock;
  const profile = response.profile;
  const deviceIdentifier = localStorage.getItem("vercelwarden.device-id");
  if (!session.capabilities["pwa.offlineReadOnly"] || !session.user || !profile ||
      profile.id !== session.user.id || !profile.email || !profile.key || !deviceIdentifier ||
      !unlock?.kdf || !Number.isSafeInteger(response.sequence) || !response.revisionDate) return;
  await vaultCache.save({
    origin: window.location.origin,
    userUuid: session.user.id,
    email: profile.email,
    deviceIdentifier,
    kdf: {
      type: unlock.kdf.kdfType ?? 0,
      iterations: unlock.kdf.iterations ?? 600_000,
      ...(typeof unlock.kdf.memory === "number" ? { memory: unlock.kdf.memory } : {}),
      ...(typeof unlock.kdf.parallelism === "number" ? { parallelism: unlock.kdf.parallelism } : {}),
    },
    encryptedUserKey: profile.key,
    encryptedPrivateKey: profile.privateKey ?? null,
    encryptedSyncPayload: response,
    revisionDate: response.revisionDate,
    sequence: response.sequence!,
  });
  localStorage.setItem("vercelwarden.offline-snapshot-ready", "1");
}

export async function fetchEncryptedVaultSync(): Promise<SyncResponse> {
  return validateSyncResponse(await apiClient<unknown>("/api/sync?excludeDomains=true"));
}

export async function fetchVaultSnapshot(): Promise<{ items: VaultItemView[]; folders: VaultFolderView[] }> {
  const response = await fetchEncryptedVaultSync();
  await persistEncryptedSnapshot(response).catch((error) => {
    console.warn("Encrypted offline snapshot was not updated", error instanceof Error ? error.name : "unknown");
  });
  return materializeVaultSnapshot(response);
}

export async function refreshVaultFromServer() {
  const snapshot = await fetchVaultSnapshot();
  vaultStore.replace(snapshot.items, snapshot.folders);
  return snapshot;
}

export async function fetchCipher(id: string): Promise<VaultItemView> {
  const cipher = await apiClient<WireCipher>(`/api/ciphers/${encodeURIComponent(id)}`);
  const vaultKey = authSecretStore.getVaultKey();
  try {
    const view = await itemView(cipher, vaultKey);
    vaultStore.mergeItem(view);
    return view;
  } finally {
    wipeBytes(vaultKey ?? undefined);
  }
}

async function encryptDraft(draft: VaultItemDraft, vaultKey: Uint8Array): Promise<Record<string, unknown>> {
  const encoder = new TextEncoder();
  const encrypted = await transformVaultItemStrings(draft, async (value) => {
    if (!value) return "";
    return encryptWithUserKey(encoder.encode(value), vaultKey);
  });
  return encodeVaultItem(encrypted);
}

export async function saveVaultItemDraft(
  draft: VaultItemDraft,
  revisionDate?: string,
  force = false
): Promise<VaultItemView> {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  try {
    const payload = await encryptDraft(draft, vaultKey);
    const cipher = draft.id
      ? await apiClient<WireCipher>(`/api/ciphers/${encodeURIComponent(draft.id)}`, {
          method: "PUT",
          headers: revisionDate ? { "If-Match": force ? "*" : `"${revisionDate}"` } : undefined,
          body: { ...payload, lastKnownRevisionDate: revisionDate },
        })
      : await apiClient<WireCipher>("/api/ciphers", { method: "POST", body: payload });
    const view = await itemView(cipher, vaultKey);
    vaultStore.mergeItem(view);
    return view;
  } finally {
    wipeBytes(vaultKey);
  }
}

export async function updateCipher(
  id: string,
  payload: Record<string, unknown>,
  revisionDate: string,
  force = false
): Promise<VaultItemView> {
  const cipher = await apiClient<WireCipher>(`/api/ciphers/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "If-Match": force ? "*" : `"${revisionDate}"` },
    body: { ...payload, lastKnownRevisionDate: revisionDate },
  });
  const vaultKey = authSecretStore.getVaultKey();
  try {
    const view = await itemView(cipher, vaultKey);
    vaultStore.mergeItem(view);
    return view;
  } finally {
    wipeBytes(vaultKey ?? undefined);
  }
}

function revisions(items: readonly VaultItemView[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.updatedAt]));
}

async function bulk(path: string, items: readonly VaultItemView[], extra: Record<string, unknown> = {}) {
  const result = await apiClient<BulkMutationResult>(path, {
    method: "PUT",
    body: { ids: items.map((item) => item.id), revisions: revisions(items), ...extra },
  });
  await refreshVaultFromServer();
  return result;
}

export const archiveCiphers = (items: readonly VaultItemView[]) => bulk("/api/ciphers/archive", items);
export const unarchiveCiphers = (items: readonly VaultItemView[]) => bulk("/api/ciphers/unarchive", items);
export const trashCiphers = (items: readonly VaultItemView[]) => bulk("/api/ciphers/delete", items);
export const restoreCiphers = (items: readonly VaultItemView[]) => bulk("/api/ciphers/restore", items);
export const permanentlyDeleteCiphers = (items: readonly VaultItemView[]) => bulk("/api/ciphers/delete-permanent", items);
export const favoriteCiphers = (items: readonly VaultItemView[], favorite: boolean) => bulk("/api/ciphers/favorite", items, { favorite });
export const moveCiphers = (items: readonly VaultItemView[], folderId: string | null) => bulk("/api/ciphers/move", items, { folderId });

export async function createFolder(name: string) {
  return apiClient<WireFolder>("/api/folders", { method: "POST", body: { name } });
}

export async function renameFolder(id: string, name: string) {
  return apiClient<WireFolder>(`/api/folders/${encodeURIComponent(id)}`, { method: "PUT", body: { name } });
}

export async function deleteFolder(id: string) {
  return apiClient<{ object: "folder"; id: string; itemsUnlinked: number; itemsDeleted: 0 }>(
    `/api/folders/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
