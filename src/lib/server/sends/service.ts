import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import type { sends } from "@/db/schema";
import { sendFiles, sends as sendsTable } from "@/db/schema";
import { hashSecret, verifySecret } from "@/lib/server/auth/secret-hash";

export const SEND_FILE_UPLOAD_TTL_MS = 15 * 60 * 1000;
export const SEND_FILE_DOWNLOAD_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_SEND_FILE_LIMIT_BYTES = 100 * 1024 * 1024;

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
  input: { fileName: unknown; fileSize: unknown; checksum?: unknown; key?: unknown },
  limit = DEFAULT_SEND_FILE_LIMIT_BYTES
) {
  if (typeof input.fileName !== "string" || !input.fileName || input.fileName.length > 20_000) {
    throw new Error("Invalid encrypted Send file name.");
  }
  const fileSize = Number(input.fileSize);
  if (!Number.isInteger(fileSize) || fileSize < 0 || fileSize > limit) {
    throw new Error("Send file size exceeds the configured limit.");
  }
  if (input.checksum != null && (typeof input.checksum !== "string" || !/^[a-f0-9]{64}$/i.test(input.checksum))) {
    throw new Error("Send file checksum must be SHA-256 hex.");
  }
  if (input.key != null && typeof input.key !== "string") throw new Error("Invalid encrypted Send file key.");
  return {
    fileName: input.fileName,
    fileSize,
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
    if (file.blobUrl) await del(file.blobUrl).catch(() => undefined);
    await db.delete(sendFiles).where(eq(sendFiles.uuid, file.uuid));
  }
  return expired.length;
}

export async function deleteSendBlobs(sendUuid: string) {
  const files = await db.select().from(sendFiles).where(eq(sendFiles.sendUuid, sendUuid));
  const outcomes = await Promise.all(files.map(async (file) => {
    if (!file.blobUrl) return { id: file.uuid, status: "deleted" as const };
    try {
      await del(file.blobUrl);
      return { id: file.uuid, status: "deleted" as const };
    } catch {
      return { id: file.uuid, status: "blob_cleanup_failed" as const };
    }
  }));
  return outcomes;
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
