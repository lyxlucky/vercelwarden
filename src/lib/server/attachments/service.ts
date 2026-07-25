import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ATTACHMENT_UPLOAD_TTL_MS = 15 * 60 * 1000;
export const ATTACHMENT_DOWNLOAD_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_ATTACHMENT_LIMIT_BYTES = 100 * 1024 * 1024;

export interface AttachmentTokenClaims {
  scope: "download";
  userUuid: string;
  cipherUuid: string;
  attachmentUuid: string;
  expiresAt: number;
}

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  return value;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function hashAttachmentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function issueUploadCredential(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashAttachmentToken(token),
    expiresAt: new Date(now + ATTACHMENT_UPLOAD_TTL_MS),
  };
}

export function verifyUploadCredential(token: string, expectedHash: string | null, expiresAt: Date | null, now = Date.now()) {
  if (!expectedHash || !expiresAt || expiresAt.getTime() <= now) return false;
  const actual = Buffer.from(hashAttachmentToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function issueDownloadToken(input: Omit<AttachmentTokenClaims, "scope" | "expiresAt">, now = Date.now()) {
  const claims: AttachmentTokenClaims = { ...input, scope: "download", expiresAt: now + ATTACHMENT_DOWNLOAD_TTL_MS };
  const payload = base64url(JSON.stringify(claims));
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: new Date(claims.expiresAt) };
}

export function verifyDownloadToken(token: string, now = Date.now()): AttachmentTokenClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AttachmentTokenClaims;
    if (claims.scope !== "download" || claims.expiresAt <= now) return null;
    if (!claims.userUuid || !claims.cipherUuid || !claims.attachmentUuid) return null;
    return claims;
  } catch {
    return null;
  }
}

export function sha256Hex(bytes: ArrayBuffer) {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export function validateAttachmentMetadata(input: { fileName: unknown; fileSize: unknown; checksum?: unknown }, limit = DEFAULT_ATTACHMENT_LIMIT_BYTES) {
  if (typeof input.fileName !== "string" || !input.fileName || input.fileName.length > 20_000) throw new Error("Invalid encrypted attachment file name.");
  if (!Number.isInteger(input.fileSize) || Number(input.fileSize) < 0 || Number(input.fileSize) > limit) throw new Error("Attachment size exceeds the configured limit.");
  if (input.checksum != null && (typeof input.checksum !== "string" || !/^[a-f0-9]{64}$/i.test(input.checksum))) throw new Error("Attachment checksum must be SHA-256 hex.");
  return { fileName: input.fileName, fileSize: Number(input.fileSize), checksum: typeof input.checksum === "string" ? input.checksum.toLowerCase() : null };
}
