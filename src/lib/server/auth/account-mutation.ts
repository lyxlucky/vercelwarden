import "server-only";
import type { AuthResult } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import type { ReauthPurpose } from "@/lib/contracts/account-security";
import { ApiError } from "@/lib/server/http/errors";
import { consumeReauthProof } from "@/lib/server/auth/reauth";

export async function authorizeAccountMutation(input: {
  request: Request;
  auth: AuthResult;
  purpose: ReauthPurpose;
  legacyMasterPasswordHash?: unknown;
}): Promise<void> {
  if (input.request.headers.has("x-reauth-proof")) {
    await consumeReauthProof(input.request, input.auth, input.purpose);
    return;
  }
  if (typeof input.legacyMasterPasswordHash === "string" && verifyPassword(
    input.legacyMasterPasswordHash,
    input.auth.user.passwordHash as Uint8Array,
    input.auth.user.salt as Uint8Array,
    input.auth.user.passwordIterations
  )) return;
  throw new ApiError(401, "reauthentication_required", "Reauthentication is required.");
}
