import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_BYTES = 32;

export async function hashSecret(secret: string, purpose: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(`${purpose}:${secret}`, salt, KEY_BYTES) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifySecret(secret: string, encoded: string, purpose: string): Promise<boolean> {
  const [algorithm, saltValue, expectedValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !expectedValue) return false;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(expectedValue, "base64url");
    if (salt.length !== 16 || expected.length !== KEY_BYTES) return false;
    const actual = await scrypt(`${purpose}:${secret}`, salt, KEY_BYTES) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

