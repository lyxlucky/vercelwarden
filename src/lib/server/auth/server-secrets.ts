import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const configured = process.env.SERVER_ENCRYPTION_KEY;
  if (configured) {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
  }
  const fallback = process.env.JWT_SECRET;
  if (!fallback || fallback.length < 32) {
    throw new Error("SERVER_ENCRYPTION_KEY must be a 32-byte base64 value, or JWT_SECRET must be at least 32 characters.");
  }
  return createHash("sha256").update("vercelwarden-server-secrets-v1\0").update(fallback).digest();
}

export function sealServerSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function openServerSecret(value: string): string | null {
  if (value.startsWith("legacy:")) return value.slice(7);
  const [version, encodedIv, encodedCiphertext, encodedTag] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext || !encodedTag) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
