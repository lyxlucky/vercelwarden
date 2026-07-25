import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const FORMAT_VERSION = 1;
const PAYLOAD_AAD = Buffer.from("vercelwarden-backup-payload-v1");
const DATA_KEY_AAD = Buffer.from("vercelwarden-backup-data-key-v1");

export function backupEncryptionKeyFromEnvironment(env: NodeJS.ProcessEnv = process.env): Uint8Array {
  const configured = env.BACKUP_ENCRYPTION_KEY;
  if (!configured) throw new Error("BACKUP_ENCRYPTION_KEY must be configured.");
  const decoded = Buffer.from(configured, "base64");
  if (decoded.byteLength !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be a 32-byte base64 value.");
  return new Uint8Array(decoded);
}

export interface BackupManifestFile {
  path: string;
  kind: "database" | "attachment";
  id?: string;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  formatVersion: 1;
  createdAt: string;
  encryption: "aes-256-gcm";
  payloadSha256: string;
  tableCount: number;
  attachmentCount: number;
  files: BackupManifestFile[];
}

export interface ZipSafetyLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxCompressionRatio: number;
}

const DEFAULT_ZIP_LIMITS: ZipSafetyLimits = {
  maxEntries: 100_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  maxCompressionRatio: 200,
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireEncryptionKey(key: Uint8Array): Buffer {
  if (key.byteLength !== 32) throw new Error("Backup encryption key must contain exactly 32 bytes.");
  return Buffer.from(key);
}

function seal(plaintext: Uint8Array, key: Uint8Array, aad: Uint8Array): Uint8Array {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requireEncryptionKey(key), iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
}

function open(sealed: Uint8Array, key: Uint8Array, aad: Uint8Array): Uint8Array {
  if (sealed.byteLength < 29) throw new Error("Backup encrypted payload is invalid.");
  const iv = sealed.slice(0, 12);
  const tag = sealed.slice(12, 28);
  const ciphertext = sealed.slice(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", requireEncryptionKey(key), iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag));
    return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch {
    throw new Error("Backup authentication or decryption failed.");
  }
}

function safeAttachmentPath(id: string): string {
  return `attachments/${Buffer.from(id, "utf8").toString("base64url")}.bin`;
}

type EncodedBackupValue =
  | null
  | string
  | number
  | boolean
  | EncodedBackupValue[]
  | { [key: string]: EncodedBackupValue };

function encodeBackupValue(value: unknown): EncodedBackupValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return { $vercelwarden: "date", value: value.toISOString() };
  if (value instanceof Uint8Array) return { $vercelwarden: "bytes", value: Buffer.from(value).toString("base64url") };
  if (Array.isArray(value)) return value.map(encodeBackupValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeBackupValue(entry)]));
  }
  throw new Error(`Backup value type is unsupported: ${typeof value}`);
}

function decodeBackupValue(value: EncodedBackupValue): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decodeBackupValue);
  if (value.$vercelwarden === "date" && typeof value.value === "string") return new Date(value.value);
  if (value.$vercelwarden === "bytes" && typeof value.value === "string") return new Uint8Array(Buffer.from(value.value, "base64url"));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeBackupValue(entry)]));
}

function assertSafeArchivePath(name: string): void {
  const normalized = name.replaceAll("\\", "/");
  if (
    !normalized
    || normalized.includes("\0")
    || normalized.startsWith("/")
    || /^[a-z]:\//iu.test(normalized)
    || normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`Backup archive path is unsafe: ${name}`);
  }
}

export function inspectZipSafety(
  bytes: Uint8Array,
  limits: Partial<ZipSafetyLimits> = {}
): Array<{ name: string; compressedSize: number; uncompressedSize: number }> {
  const applied = { ...DEFAULT_ZIP_LIMITS, ...limits };
  if (bytes.byteLength < 22) throw new Error("Backup archive is not a valid ZIP file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Backup archive central directory is missing.");
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (entryCount > applied.maxEntries) throw new Error("Backup archive entry limit exceeded.");
  const entries: Array<{ name: string; compressedSize: number; uncompressedSize: number }> = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Backup archive central directory is invalid.");
    }
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const nameEnd = offset + 46 + nameLength;
    if (nameEnd > bytes.byteLength) throw new Error("Backup archive filename is invalid.");
    const name = new TextDecoder().decode(bytes.slice(offset + 46, nameEnd));
    assertSafeArchivePath(name);
    const canonical = name.replaceAll("\\", "/").toLowerCase();
    if (seen.has(canonical)) throw new Error(`Backup archive contains a duplicate path: ${name}`);
    seen.add(canonical);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) throw new Error(`Backup archive symlink is not allowed: ${name}`);
    if (uncompressedSize > applied.maxEntryBytes) throw new Error(`Backup archive entry limit exceeded: ${name}`);
    totalBytes += uncompressedSize;
    if (totalBytes > applied.maxTotalBytes) throw new Error("Backup archive total size limit exceeded.");
    const ratio = compressedSize === 0 ? (uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY) : uncompressedSize / compressedSize;
    if (ratio > applied.maxCompressionRatio) throw new Error(`Backup archive compression ratio limit exceeded: ${name}`);
    entries.push({ name, compressedSize, uncompressedSize });
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

export function createBackupArchive(input: {
  tables: Record<string, unknown[]>;
  attachments: Array<{ id: string; bytes: Uint8Array }>;
  encryptionKey: Uint8Array;
  createdAt?: Date;
}): {
  archive: Uint8Array;
  encryptedDataKey: string;
  sha256: string;
  manifest: BackupManifest;
} {
  const createdAt = input.createdAt ?? new Date();
  const databaseBytes = strToU8(JSON.stringify(encodeBackupValue({ formatVersion: FORMAT_VERSION, tables: input.tables })));
  const files: Record<string, Uint8Array> = { "database.json": databaseBytes };
  const manifestFiles: BackupManifestFile[] = [{
    path: "database.json",
    kind: "database",
    size: databaseBytes.byteLength,
    sha256: sha256(databaseBytes),
  }];
  for (const attachment of input.attachments) {
    const path = safeAttachmentPath(attachment.id);
    files[path] = attachment.bytes;
    manifestFiles.push({
      path,
      kind: "attachment",
      id: attachment.id,
      size: attachment.bytes.byteLength,
      sha256: sha256(attachment.bytes),
    });
  }
  const innerArchive = zipSync(files, { level: 6 });
  const dataKey = randomBytes(32);
  const encryptedPayload = seal(innerArchive, dataKey, PAYLOAD_AAD);
  const manifest: BackupManifest = {
    formatVersion: FORMAT_VERSION,
    createdAt: createdAt.toISOString(),
    encryption: "aes-256-gcm",
    payloadSha256: sha256(encryptedPayload),
    tableCount: Object.keys(input.tables).length,
    attachmentCount: input.attachments.length,
    files: manifestFiles,
  };
  const archive = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "payload.bin": encryptedPayload,
  }, { level: 0 });
  return {
    archive,
    encryptedDataKey: Buffer.from(seal(dataKey, input.encryptionKey, DATA_KEY_AAD)).toString("base64url"),
    sha256: sha256(archive),
    manifest,
  };
}

function parseManifest(bytes: Uint8Array): BackupManifest {
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(strFromU8(bytes)) as BackupManifest;
  } catch {
    throw new Error("Backup manifest is invalid.");
  }
  if (manifest.formatVersion !== FORMAT_VERSION) throw new Error("Backup format version is unsupported.");
  if (manifest.encryption !== "aes-256-gcm" || !Array.isArray(manifest.files)) {
    throw new Error("Backup manifest is invalid.");
  }
  return manifest;
}

export function openBackupArchive(input: {
  archive: Uint8Array;
  encryptedDataKey: string;
  expectedSha256: string;
  encryptionKey: Uint8Array;
}): {
  manifest: BackupManifest;
  tables: Record<string, unknown[]>;
  attachments: Array<{ id: string; bytes: Uint8Array }>;
} {
  if (sha256(input.archive) !== input.expectedSha256.toLowerCase()) {
    throw new Error("Backup archive checksum mismatch.");
  }
  inspectZipSafety(input.archive);
  const outer = unzipSync(input.archive);
  if (!outer["manifest.json"] || !outer["payload.bin"] || Object.keys(outer).length !== 2) {
    throw new Error("Backup archive layout is invalid.");
  }
  const manifest = parseManifest(outer["manifest.json"]);
  if (sha256(outer["payload.bin"]) !== manifest.payloadSha256) {
    throw new Error("Backup payload checksum mismatch.");
  }
  let sealedDataKey: Uint8Array;
  try {
    sealedDataKey = new Uint8Array(Buffer.from(input.encryptedDataKey, "base64url"));
  } catch {
    throw new Error("Backup encrypted data key is invalid.");
  }
  const dataKey = open(sealedDataKey, input.encryptionKey, DATA_KEY_AAD);
  const innerBytes = open(outer["payload.bin"], dataKey, PAYLOAD_AAD);
  inspectZipSafety(innerBytes);
  const inner = unzipSync(innerBytes);
  const expectedPaths = new Set(manifest.files.map((file) => file.path));
  if (Object.keys(inner).some((path) => !expectedPaths.has(path)) || Object.keys(inner).length !== expectedPaths.size) {
    throw new Error("Backup payload contains unexpected or missing files.");
  }
  for (const file of manifest.files) {
    const bytes = inner[file.path];
    if (!bytes || bytes.byteLength !== file.size || sha256(bytes) !== file.sha256) {
      throw new Error(`Backup file checksum mismatch: ${file.path}`);
    }
  }
  const databaseFile = manifest.files.find((file) => file.kind === "database");
  if (!databaseFile) throw new Error("Backup database payload is missing.");
  let database: { formatVersion: number; tables: Record<string, unknown[]> };
  try {
    database = decodeBackupValue(JSON.parse(strFromU8(inner[databaseFile.path]!)) as EncodedBackupValue) as typeof database;
  } catch {
    throw new Error("Backup database payload is invalid.");
  }
  if (database.formatVersion !== FORMAT_VERSION || !database.tables || typeof database.tables !== "object") {
    throw new Error("Backup database payload is invalid.");
  }
  const attachments = manifest.files
    .filter((file): file is BackupManifestFile & { id: string } => file.kind === "attachment" && typeof file.id === "string")
    .map((file) => ({ id: file.id, bytes: inner[file.path]! }));
  return { manifest, tables: database.tables, attachments };
}

export interface RestoreKindResult {
  kind: string;
  restored: number;
  failed: number;
}

export function summarizeRestoreResults(results: RestoreKindResult[]): {
  status: "succeeded" | "partially-succeeded" | "failed";
  restored: number;
  failed: number;
  results: RestoreKindResult[];
} {
  const restored = results.reduce((total, result) => total + result.restored, 0);
  const failed = results.reduce((total, result) => total + result.failed, 0);
  return {
    status: failed === 0 ? "succeeded" : restored === 0 ? "failed" : "partially-succeeded",
    restored,
    failed,
    results,
  };
}
