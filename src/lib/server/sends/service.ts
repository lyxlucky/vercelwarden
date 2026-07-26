import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { del, head } from "@vercel/blob";
import { db } from "@/db";
import type { sends } from "@/db/schema";
import { sendFiles, sends as sendsTable } from "@/db/schema";
import { commitUserMutation } from "@/lib/server/mutations/commit";
import { hashSecret, verifySecret } from "@/lib/server/auth/secret-hash";

export const SEND_FILE_UPLOAD_TTL_MS = 15 * 60 * 1000;
export const SEND_FILE_DOWNLOAD_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_SEND_FILE_LIMIT_BYTES = 100 * 1024 * 1024;

// The plaintext cap above, expressed as the largest encrypted body it can
// produce: AES-CBC adds up to 16 bytes of PKCS7 padding, plus a 16-byte IV and
// a 32-byte MAC. Used to bound the blob and to gate the client upload token.
export function encryptedCapForPlaintext(plaintextCap = DEFAULT_SEND_FILE_LIMIT_BYTES) {
  return plaintextCap + 16 + 16 + 32;
}

// Deterministic private-blob path for a Send file. Recomputed (never trusted
// from the client) by the upload-token route, the confirm step, and cleanup so
// all three agree on exactly one location per pending file.
export function sendFileBlobPath(userUuid: string, sendUuid: string, fileUuid: string) {
  return `sends/${userUuid}/${sendUuid}/${fileUuid}`;
}

interface SendFileDownloadClaims {
  scope: "send-file-download";
  sendUuid: string;
  fileUuid: string;
  expiresAt: number;
}

function signingSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  return value;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function issueSendFileUploadCredential(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), expiresAt: new Date(now + SEND_FILE_UPLOAD_TTL_MS) };
}

export function verifySendFileUploadCredential(
  token: string,
  expectedHash: string | null,
  expiresAt: Date | null,
  now = Date.now()
) {
  if (!expectedHash || !expiresAt || expiresAt.getTime() <= now) return false;
  const actual = Buffer.from(hashToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function issueSendFileDownloadToken(
  input: Omit<SendFileDownloadClaims, "scope" | "expiresAt">,
  now = Date.now()
) {
  const claims: SendFileDownloadClaims = {
    ...input,
    scope: "send-file-download",
    expiresAt: now + SEND_FILE_DOWNLOAD_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: new Date(claims.expiresAt) };
}

export function verifySendFileDownloadToken(token: string, now = Date.now()): SendFileDownloadClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SendFileDownloadClaims;
    if (claims.scope !== "send-file-download" || claims.expiresAt <= now || !claims.sendUuid || !claims.fileUuid) return null;
    return claims;
  } catch {
    return null;
  }
}

export function validateSendFileMetadata(
  input: { fileName: unknown; fileSize: unknown; checksum?: unknown; key?: unknown; plaintextSize?: unknown },
  limit = DEFAULT_SEND_FILE_LIMIT_BYTES
) {
  if (typeof input.fileName !== "string" || !input.fileName || input.fileName.length > 20_000) {
    throw new Error("Invalid encrypted Send file name.");
  }
  const fileSize = Number(input.fileSize);
  const hasPlaintext = input.plaintextSize != null && input.plaintextSize !== "";
  const plaintextSize = hasPlaintext ? Number(input.plaintextSize) : null;
  if (hasPlaintext) {
    // New raw-binary Send: enforce the limit against the PLAINTEXT size and
    // require the encrypted body to exceed plaintext (iv+pad+mac) but stay under
    // the encrypted cap.
    if (!Number.isInteger(plaintextSize!) || plaintextSize! < 0 || plaintextSize! > limit) {
      throw new Error("Send file size exceeds the configured limit.");
    }
    if (!Number.isInteger(fileSize) || fileSize <= plaintextSize! || fileSize > encryptedCapForPlaintext(limit)) {
      throw new Error("Invalid encrypted Send file size.");
    }
  } else {
    // Legacy / official-client path: only the encrypted size is known.
    if (!Number.isInteger(fileSize) || fileSize < 0 || fileSize > limit) {
      throw new Error("Send file size exceeds the configured limit.");
    }
  }
  if (input.checksum != null && (typeof input.checksum !== "string" || !/^[a-f0-9]{64}$/i.test(input.checksum))) {
    throw new Error("Send file checksum must be SHA-256 hex.");
  }
  if (input.key != null && typeof input.key !== "string") throw new Error("Invalid encrypted Send file key.");
  return {
    fileName: input.fileName,
    fileSize,
    plaintextSize,
    checksum: typeof input.checksum === "string" ? input.checksum.toLowerCase() : null,
    key: typeof input.key === "string" ? input.key : null,
  };
}

export function sha256SendFile(bytes: ArrayBuffer) {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export async function cleanupExpiredPendingSendFiles(now = new Date()) {
  const expired = await db
    .select()
    .from(sendFiles)
    .where(and(eq(sendFiles.status, "pending"), lt(sendFiles.uploadExpiresAt, now)));
  for (const file of expired) {
    // blobUrl holds the deterministic pathname for pending rows, so del() removes
    // the orphaned private blob even if the client never confirmed the upload.
    if (file.blobUrl) await del(file.blobUrl).catch(() => undefined);
    await db.delete(sendFiles).where(eq(sendFiles.uuid, file.uuid));
    // Drop the parent file-Send if reaping this pending file left it fileless,
    // so a never-completed upload can't linger in the vault until deletionDate.
    const [remaining] = await db.select({ uuid: sendFiles.uuid }).from(sendFiles).where(eq(sendFiles.sendUuid, file.sendUuid)).limit(1);
    if (!remaining) {
      await db.delete(sendsTable).where(and(eq(sendsTable.uuid, file.sendUuid), eq(sendsTable.type, 1)));
    }
  }
  return expired.length;
}

// Idempotent completion of a client-direct-to-Blob upload. Shared by the explicit
// confirm endpoint (PUT /api/sends/file — primary, works in local dev) and the
// Vercel Blob onUploadCompleted webhook (prod safety net). head() is the source
// of truth for the real uploaded size — the multipart token size cap is only
// enforced client-side, so it is defense-in-depth, not the gate.
export async function confirmSendFileUpload(input: {
  userUuid: string;
  sendUuid: string;
  fileUuid: string;
  actingDeviceIdentifier?: string;
  now?: Date;
}): Promise<
  | { ok: true; send: typeof sends.$inferSelect; file: typeof sendFiles.$inferSelect }
  | { ok: false; status: number; message: string }
> {
  const now = input.now ?? new Date();
  const [send] = await db.select().from(sendsTable)
    .where(and(eq(sendsTable.uuid, input.sendUuid), eq(sendsTable.userUuid, input.userUuid), eq(sendsTable.type, 1))).limit(1);
  if (!send) return { ok: false, status: 404, message: "Send not found" };
  const [file] = await db.select().from(sendFiles)
    .where(and(eq(sendFiles.uuid, input.fileUuid), eq(sendFiles.sendUuid, input.sendUuid))).limit(1);
  if (!file) return { ok: false, status: 404, message: "Send file not found" };
  if (file.status === "complete") return { ok: true, send, file }; // idempotent replay (confirm/webhook race)
  if (file.status !== "pending") return { ok: false, status: 409, message: "Send file is not awaiting upload" };

  const pathname = sendFileBlobPath(input.userUuid, input.sendUuid, input.fileUuid);
  let meta: Awaited<ReturnType<typeof head>> | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { meta = await head(pathname); break; }
    catch { if (attempt === 1) return { ok: false, status: 409, message: "Send file upload has not finished" }; }
  }
  if (!meta) return { ok: false, status: 409, message: "Send file upload has not finished" };
  if (meta.size !== file.fileSize || meta.size > encryptedCapForPlaintext()) {
    await del(pathname).catch(() => undefined);
    await db.update(sendFiles).set({ status: "failed", uploadTokenHash: null, uploadExpiresAt: null }).where(eq(sendFiles.uuid, input.fileUuid));
    return { ok: false, status: 400, message: "Send upload size does not match metadata" };
  }

  await commitUserMutation({
    userUuid: input.userUuid,
    resourceKind: "send",
    resourceId: input.sendUuid,
    actingDeviceIdentifier: input.actingDeviceIdentifier,
    mutate: async (tx) => {
      const updated = await tx.update(sendFiles).set({
        blobUrl: meta!.url,
        status: "complete",
        uploadTokenHash: null,
        uploadExpiresAt: null,
        completedAt: now,
      }).where(and(eq(sendFiles.uuid, input.fileUuid), eq(sendFiles.status, "pending"))).returning();
      if (updated.length) await tx.update(sendsTable).set({ updatedAt: now }).where(eq(sendsTable.uuid, input.sendUuid));
    },
  });
  const [freshSend] = await db.select().from(sendsTable).where(eq(sendsTable.uuid, input.sendUuid)).limit(1);
  const [freshFile] = await db.select().from(sendFiles).where(eq(sendFiles.uuid, input.fileUuid)).limit(1);
  return { ok: true, send: freshSend!, file: freshFile! };
}

export async function deleteSendBlobs(sendUuid: string) {
  const files = await db.select().from(sendFiles).where(eq(sendFiles.sendUuid, sendUuid));
  return deleteSendFileBlobs(files);
}

// Best-effort blob removal for already-fetched Send file rows. Call this AFTER
// the send rows are deleted (deletion cascades the file rows away), using URLs
// captured beforehand, so a blob failure can never leave an undeletable send
// row behind.
export async function deleteSendFileBlobs(files: Array<{ uuid: string; blobUrl: string | null }>) {
  return Promise.all(files.map(async (file) => {
    if (!file.blobUrl) return { id: file.uuid, status: "deleted" as const };
    try {
      await del(file.blobUrl);
      return { id: file.uuid, status: "deleted" as const };
    } catch {
      return { id: file.uuid, status: "blob_cleanup_failed" as const };
    }
  }));
}

export async function hashSendPassword(password: string | null | undefined) {
  return password ? hashSecret(password, "send-access") : null;
}

async function verifyLegacyPassword(password: string, stored: string) {
  if (stored.startsWith("scrypt$")) return verifySecret(password, stored, "send-access");
  const left = new TextEncoder().encode(password);
  const right = new TextEncoder().encode(stored);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

export function sendUnavailableReason(send: typeof sends.$inferSelect, now = new Date()) {
  if (send.disabled) return "disabled" as const;
  if (send.deletionDate.getTime() <= now.getTime()) return "deleted" as const;
  if (send.expirationDate && send.expirationDate.getTime() <= now.getTime()) return "expired" as const;
  if (send.maxAccessCount !== null && send.accessCount >= send.maxAccessCount) return "exhausted" as const;
  return null;
}

// Verify availability + password WITHOUT consuming an access. Used by the public
// /access endpoint for FILE Sends, whose access is spent at download time (not on
// page open), and to read the Send type before deciding whether to consume.
export async function peekSendAccess(sendUuid: string, password: string | undefined, now = new Date()) {
  const [send] = await db.select().from(sendsTable).where(eq(sendsTable.uuid, sendUuid)).limit(1);
  if (!send || sendUnavailableReason(send, now)) return { status: "unavailable" as const };
  if (send.password) {
    if (!password || !await verifyLegacyPassword(password, send.password)) return { status: "invalid_password" as const };
  }
  return { status: "ok" as const, send };
}

export async function consumeSendAccess(
  tx: {
    select: typeof import("@/db").db.select;
    update: typeof import("@/db").db.update;
  },
  sendUuid: string,
  password: string | undefined,
  now = new Date()
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [send] = await tx.select().from(sendsTable).where(eq(sendsTable.uuid, sendUuid)).limit(1);
    if (!send || sendUnavailableReason(send, now)) return { status: "unavailable" as const };
    if (send.password) {
      if (!password || !await verifyLegacyPassword(password, send.password)) return { status: "invalid_password" as const };
    }
    const updated = await tx.update(sendsTable).set({ accessCount: send.accessCount + 1, updatedAt: now }).where(and(eq(sendsTable.uuid, sendUuid), eq(sendsTable.accessCount, send.accessCount))).returning();
    if (updated.length === 0) continue;
    if (send.password && !send.password.startsWith("scrypt$")) {
      await tx.update(sendsTable).set({ password: await hashSendPassword(password!) }).where(eq(sendsTable.uuid, sendUuid));
    }
    return { status: "ok" as const, send: updated[0]! };
  }
  return { status: "unavailable" as const };
}
