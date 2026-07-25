import "server-only";

import { del, list, put } from "@vercel/blob";
import { openServerSecret, sealServerSecret } from "@/lib/server/auth/server-secrets";

export type BackupDestinationProvider = "local" | "vercel-blob" | "webdav";

export interface StoredBackupObject {
  key: string;
  size: number;
  updatedAt: Date;
}

export interface BackupDestinationAdapter {
  write(key: string, bytes: Uint8Array): Promise<StoredBackupObject>;
  read(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<StoredBackupObject[]>;
}

export interface WebDavDestinationConfig {
  baseUrl: string;
  username?: string;
  password?: string;
}

export type BackupDestinationConfig = Record<string, unknown> | WebDavDestinationConfig;

const localObjects = new Map<string, { bytes: Uint8Array; updatedAt: Date }>();

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function normalizedObjectKey(key: string): string {
  const normalized = key.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Backup destination object key is invalid.");
  }
  return normalized;
}

export function encryptDestinationConfig(config: BackupDestinationConfig): string {
  return sealServerSecret(JSON.stringify(config));
}

export function decryptDestinationConfig(value: string): BackupDestinationConfig {
  const opened = openServerSecret(value);
  if (!opened) throw new Error("Backup destination configuration cannot be decrypted.");
  try {
    const parsed = JSON.parse(opened) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed as BackupDestinationConfig;
  } catch {
    throw new Error("Backup destination configuration is invalid.");
  }
}

function localAdapter(): BackupDestinationAdapter {
  return {
    async write(key, bytes) {
      const safeKey = normalizedObjectKey(key);
      const updatedAt = new Date();
      localObjects.set(safeKey, { bytes: bytes.slice(), updatedAt });
      return { key: safeKey, size: bytes.byteLength, updatedAt };
    },
    async read(key) {
      const stored = localObjects.get(normalizedObjectKey(key));
      if (!stored) throw new Error("Backup object is missing.");
      return stored.bytes.slice();
    },
    async delete(key) {
      localObjects.delete(normalizedObjectKey(key));
    },
    async list(prefix = "") {
      const normalizedPrefix = prefix ? normalizedObjectKey(prefix) : "";
      return [...localObjects.entries()]
        .filter(([key]) => key.startsWith(normalizedPrefix))
        .map(([key, value]) => ({ key, size: value.bytes.byteLength, updatedAt: value.updatedAt }))
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    },
  };
}

function vercelBlobAdapter(): BackupDestinationAdapter {
  return {
    async write(key, bytes) {
      const safeKey = normalizedObjectKey(key);
      const blob = await put(safeKey, new Blob([ownedArrayBuffer(bytes)]), { access: "public", addRandomSuffix: false });
      return { key: blob.url, size: bytes.byteLength, updatedAt: new Date() };
    },
    async read(key) {
      const response = await fetch(key, { cache: "no-store" });
      if (!response.ok) throw new Error(`Backup object download failed with status ${response.status}.`);
      return new Uint8Array(await response.arrayBuffer());
    },
    async delete(key) {
      await del(key);
    },
    async list(prefix = "backups/") {
      const result = await list({ prefix });
      return result.blobs.map((blob) => ({
        key: blob.url,
        size: blob.size,
        updatedAt: blob.uploadedAt,
      }));
    },
  };
}

function webDavHeaders(config: WebDavDestinationConfig): Headers {
  const headers = new Headers();
  if (config.username || config.password) {
    headers.set("Authorization", `Basic ${Buffer.from(`${config.username ?? ""}:${config.password ?? ""}`).toString("base64")}`);
  }
  return headers;
}

function webDavUrl(config: WebDavDestinationConfig, key: string): URL {
  const base = new URL(config.baseUrl);
  if (base.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("Production WebDAV backup destinations must use HTTPS.");
  }
  const safeKey = normalizedObjectKey(key);
  return new URL(safeKey.split("/").map(encodeURIComponent).join("/"), `${base.toString().replace(/\/?$/, "/")}`);
}

function webDavAdapter(config: WebDavDestinationConfig): BackupDestinationAdapter {
  return {
    async write(key, bytes) {
      const url = webDavUrl(config, key);
      const response = await fetch(url, { method: "PUT", headers: webDavHeaders(config), body: ownedArrayBuffer(bytes) });
      if (!response.ok) throw new Error(`WebDAV backup upload failed with status ${response.status}.`);
      return { key: normalizedObjectKey(key), size: bytes.byteLength, updatedAt: new Date() };
    },
    async read(key) {
      const response = await fetch(webDavUrl(config, key), { headers: webDavHeaders(config), cache: "no-store" });
      if (!response.ok) throw new Error(`WebDAV backup download failed with status ${response.status}.`);
      return new Uint8Array(await response.arrayBuffer());
    },
    async delete(key) {
      const response = await fetch(webDavUrl(config, key), { method: "DELETE", headers: webDavHeaders(config) });
      if (!response.ok && response.status !== 404) throw new Error(`WebDAV backup deletion failed with status ${response.status}.`);
    },
    async list(prefix = "backups/") {
      const url = webDavUrl(config, prefix);
      const headers = webDavHeaders(config);
      headers.set("Depth", "1");
      const response = await fetch(url, { method: "PROPFIND", headers });
      if (!response.ok) throw new Error(`WebDAV backup listing failed with status ${response.status}.`);
      const body = await response.text();
      const hrefs = [...body.matchAll(/<(?:[^:>]+:)?href[^>]*>([^<]+)<\/(?:[^:>]+:)?href>/giu)]
        .map((match) => match[1])
        .filter((href): href is string => Boolean(href));
      return hrefs.map((href) => ({ key: decodeURIComponent(new URL(href, url).pathname.replace(/^\/+/, "")), size: 0, updatedAt: new Date(0) }));
    },
  };
}

export function createDestinationAdapter(
  provider: BackupDestinationProvider,
  config: BackupDestinationConfig = {}
): BackupDestinationAdapter {
  if (provider === "local") return localAdapter();
  if (provider === "vercel-blob") return vercelBlobAdapter();
  const webDav = config as WebDavDestinationConfig;
  if (!webDav.baseUrl) throw new Error("WebDAV backup destination requires a baseUrl.");
  return webDavAdapter(webDav);
}
