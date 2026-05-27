import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import {
  generateTotpSecret,
  buildOtpAuthUri,
} from "@/lib/totp";
import { unauthorized, errorResponse, jsonResponse } from "@/lib/responses";

// POST /api/two-factor/get-authenticator
// Returns the currently configured secret (if any) plus an otpauth URI for QR.
// Client posts `masterPasswordHash` for confirmation.
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  const hash = body?.masterPasswordHash ?? body?.secret;
  if (!hash) return errorResponse("Missing masterPasswordHash");

  const ok = verifyPassword(
    hash,
    auth.user.passwordHash as Uint8Array,
    auth.user.salt as Uint8Array,
    auth.user.passwordIterations
  );
  if (!ok) return errorResponse("Invalid password");

  // If already enabled, return the existing secret; otherwise generate a new
  // unconfirmed secret (it is only persisted once the user verifies the code).
  const enabled = !!auth.user.totpSecret;
  const key = auth.user.totpSecret ?? generateTotpSecret();

  return jsonResponse({
    enabled,
    key,
    object: "twoFactorAuthenticator",
  });
}
