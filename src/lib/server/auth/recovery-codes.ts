import "server-only";
import { hashSecret, verifySecret } from "@/lib/server/auth/secret-hash";

function normalizeRecoveryCode(code: string): string {
  return code.normalize("NFKC").replace(/[\s-]+/g, "").toUpperCase();
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return hashSecret(normalizeRecoveryCode(code), "recovery-code");
}

export async function verifyRecoveryCode(code: string, encoded: string): Promise<boolean> {
  return verifySecret(normalizeRecoveryCode(code), encoded, "recovery-code");
}

