"use client";

import { openDB, type IDBPDatabase } from "idb";

const DATABASE_NAME = "vercelwarden-client";
const DATABASE_VERSION = 2;
const SNAPSHOT_STORE = "vault-snapshots";
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

export interface SnapshotKdf {
  type: number;
  iterations: number;
  memory?: number;
  parallelism?: number;
}

export interface EncryptedVaultSnapshotInput {
  origin: string;
  userUuid: string;
  email: string;
  deviceIdentifier: string;
  kdf: SnapshotKdf;
  encryptedUserKey: string;
  encryptedPrivateKey?: string | null;
  encryptedSyncPayload: unknown;
  revisionDate: string;
  sequence: number;
}

export interface EncryptedVaultSnapshotRecord {
  version: 1;
  origin: string;
  userUuid: string;
  emailHash: string;
  deviceIdentifier: string;
  kdf: SnapshotKdf;
  encryptedUserKey: string;
  encryptedPrivateKey?: string | null;
  encryptedSyncPayload: unknown;
  revisionDate: string;
  sequence: number;
  savedAt: number;
  sha256: string;
}

export interface SnapshotBinding {
  origin: string;
  userUuid: string;
  deviceIdentifier: string;
}

export interface VaultCacheStorage {
  get(key: string): Promise<EncryptedVaultSnapshotRecord | undefined>;
  getAll(): Promise<EncryptedVaultSnapshotRecord[]>;
  put(key: string, record: EncryptedVaultSnapshotRecord): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class VaultCacheError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "VaultCacheError";
  }
}

const FORBIDDEN_FIELDS = new Set([
  "accesstoken",
  "refreshtoken",
  "masterkey",
  "userkey",
  "clipboardvalue",
  "reauthenticationproof",
  "reauthproof",
  "totpcode",
  "searchindex",
]);
const TRANSIENT_FIELDS = new Set(["url", "uploadurl", "downloadurl", "uploadtoken", "downloadtoken"]);

function snapshotKey(binding: SnapshotBinding): string {
  return JSON.stringify([binding.origin, binding.userUuid, binding.deviceIdentifier]);
}

function validateBinding(input: SnapshotBinding) {
  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    throw new VaultCacheError("snapshot_binding_invalid", "Snapshot origin is invalid.");
  }
  const localhost = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  if ((origin.protocol !== "https:" && !localhost) || origin.origin !== input.origin) {
    throw new VaultCacheError("snapshot_binding_invalid", "Offline snapshots require an exact secure origin.");
  }
  if (!input.userUuid || !input.deviceIdentifier) {
    throw new VaultCacheError("snapshot_binding_invalid", "Snapshot account and device bindings are required.");
  }
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new VaultCacheError("snapshot_invalid_value", "Snapshot numbers must be finite.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen));
  if (!value || typeof value !== "object") {
    throw new VaultCacheError("snapshot_invalid_value", "Snapshot contains a non-serializable value.");
  }
  if (seen.has(value)) throw new VaultCacheError("snapshot_invalid_value", "Snapshot contains a cyclic value.");
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (FORBIDDEN_FIELDS.has(normalized) || normalized.includes("plaintext") || normalized.includes("decrypted")) {
      throw new VaultCacheError("snapshot_forbidden_field", `Snapshot field ${key} is not persistable.`);
    }
    if (TRANSIENT_FIELDS.has(normalized)) continue;
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) result[key] = sanitizeValue(child, seen);
  }
  seen.delete(value);
  return result;
}

export function sanitizeEncryptedSyncPayload(payload: unknown): unknown {
  const sanitized = sanitizeValue(payload, new WeakSet());
  const serialized = stableStringify(sanitized);
  if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new VaultCacheError("snapshot_too_large", "Encrypted snapshot exceeds the local size limit.");
  }
  return sanitized;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
  ).join(",")}}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recordChecksum(record: Omit<EncryptedVaultSnapshotRecord, "sha256">): Promise<string> {
  return sha256(stableStringify(record));
}

class IndexedDbVaultCacheStorage implements VaultCacheStorage {
  private database: Promise<IDBPDatabase> | null = null;

  private open() {
    this.database ??= openDB(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) database.createObjectStore(SNAPSHOT_STORE);
      },
    });
    return this.database;
  }

  async get(key: string) {
    return (await this.open()).get(SNAPSHOT_STORE, key) as Promise<EncryptedVaultSnapshotRecord | undefined>;
  }

  async getAll() {
    return (await this.open()).getAll(SNAPSHOT_STORE) as Promise<EncryptedVaultSnapshotRecord[]>;
  }

  async put(key: string, record: EncryptedVaultSnapshotRecord) {
    const database = await this.open();
    const transaction = database.transaction(SNAPSHOT_STORE, "readwrite", { durability: "strict" });
    await transaction.store.put(record, key);
    await transaction.done;
  }

  async delete(key: string) {
    await (await this.open()).delete(SNAPSHOT_STORE, key);
  }

  async clear() {
    await (await this.open()).clear(SNAPSHOT_STORE);
  }
}

export class VaultCache {
  constructor(private readonly storage: VaultCacheStorage = new IndexedDbVaultCacheStorage()) {}

  async save(input: EncryptedVaultSnapshotInput): Promise<EncryptedVaultSnapshotRecord> {
    validateBinding(input);
    if (!input.encryptedUserKey || !Number.isSafeInteger(input.sequence) || input.sequence < 0) {
      throw new VaultCacheError("snapshot_invalid", "Snapshot encryption and revision metadata are required.");
    }
    const sanitizedPayload = sanitizeEncryptedSyncPayload(input.encryptedSyncPayload);
    const kdf: SnapshotKdf = {
      type: input.kdf.type,
      iterations: input.kdf.iterations,
      ...(typeof input.kdf.memory === "number" ? { memory: input.kdf.memory } : {}),
      ...(typeof input.kdf.parallelism === "number" ? { parallelism: input.kdf.parallelism } : {}),
    };
    const withoutChecksum: Omit<EncryptedVaultSnapshotRecord, "sha256"> = {
      version: 1,
      origin: input.origin,
      userUuid: input.userUuid,
      emailHash: await sha256(input.email.normalize("NFKC").trim().toLowerCase()),
      deviceIdentifier: input.deviceIdentifier,
      kdf,
      encryptedUserKey: input.encryptedUserKey,
      encryptedPrivateKey: input.encryptedPrivateKey ?? null,
      encryptedSyncPayload: sanitizedPayload,
      revisionDate: input.revisionDate,
      sequence: input.sequence,
      savedAt: Date.now(),
    };
    const record = { ...withoutChecksum, sha256: await recordChecksum(withoutChecksum) };
    await this.storage.put(snapshotKey(record), record);
    return record;
  }

  async load(binding: SnapshotBinding): Promise<EncryptedVaultSnapshotRecord | null> {
    validateBinding(binding);
    const record = await this.storage.get(snapshotKey(binding));
    if (!record) return null;
    if (record.version !== 1 || record.origin !== binding.origin || record.userUuid !== binding.userUuid ||
        record.deviceIdentifier !== binding.deviceIdentifier) {
      throw new VaultCacheError("snapshot_binding_mismatch", "Offline snapshot binding does not match this account and device.");
    }
    const { sha256: expected, ...withoutChecksum } = record;
    if (await recordChecksum(withoutChecksum) !== expected) {
      throw new VaultCacheError("snapshot_checksum_mismatch", "Offline snapshot integrity verification failed.");
    }
    sanitizeEncryptedSyncPayload(record.encryptedSyncPayload);
    return structuredClone(record);
  }

  async findForDevice(origin: string, deviceIdentifier: string): Promise<EncryptedVaultSnapshotRecord | null> {
    const candidates = (await this.storage.getAll())
      .filter((record) => record.origin === origin && record.deviceIdentifier === deviceIdentifier)
      .sort((left, right) => right.savedAt - left.savedAt);
    if (!candidates[0]) return null;
    return this.load(candidates[0]);
  }

  async delete(binding: SnapshotBinding) {
    await this.storage.delete(snapshotKey(binding));
  }

  async deleteAccount(origin: string, userUuid: string) {
    const records = await this.storage.getAll();
    await Promise.all(records
      .filter((record) => record.origin === origin && record.userUuid === userUuid)
      .map((record) => this.storage.delete(snapshotKey(record))));
  }

  async clear() {
    await this.storage.clear();
  }
}

export const vaultCache = new VaultCache();

export async function clearVercelwardenLocalData() {
  await vaultCache.clear();
  if ("caches" in globalThis) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("vercelwarden-")).map((name) => caches.delete(name)));
  }
}
