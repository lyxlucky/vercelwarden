import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { AuthResult } from "@/lib/auth";
import { checkAdminAuth } from "@/lib/admin";
import { authenticateRequest, requireRole } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import type { ReauthPurpose } from "@/lib/contracts/account-security";
import { ApiError } from "@/lib/server/http/errors";

export type AdminAuthorization =
  | { auth: AuthResult; legacy: false }
  | { auth: null; legacy: true };

export function assertAdminRole(auth: AuthResult): AuthResult {
  return requireRole(auth, "admin");
}

export async function bootstrapAdminFromEnvironment(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.normalize("NFKC").trim().toLowerCase();
  if (!email) return;
  const [existingAdmin] = await db.select({ uuid: users.uuid }).from(users).where(eq(users.role, "admin")).limit(1);
  if (existingAdmin) return;
  const promoted = await db.update(users).set({ role: "admin", updatedAt: new Date() })
    .where(eq(users.email, email)).returning({ uuid: users.uuid });
  if (promoted.length !== 1) {
    throw new ApiError(503, "admin_bootstrap_pending", "The configured bootstrap administrator account does not exist yet.");
  }
}

export async function authorizeAdminRequest(
  request: Request,
  options: { purpose?: ReauthPurpose; allowLegacyRead?: boolean } = {}
): Promise<AdminAuthorization> {
  await bootstrapAdminFromEnvironment();
  try {
    const auth = assertAdminRole(await authenticateRequest(request));
    if (options.purpose) await consumeReauthProof(request, auth, options.purpose);
    return { auth, legacy: false };
  } catch (error) {
    const legacyAllowed = process.env.ALLOW_LEGACY_ADMIN_BASIC === "true"
      && options.allowLegacyRead !== false
      && request.method === "GET"
      && !options.purpose
      && checkAdminAuth(request);
    if (legacyAllowed) return { auth: null, legacy: true };
    throw error;
  }
}
