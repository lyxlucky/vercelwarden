import { NextRequest } from "next/server";
import { buildProfile } from "@/lib/auth";
import { createUser } from "@/lib/register";
import { verifyRegistrationToken } from "@/lib/registration-token";
import { jsonResponse, errorResponse } from "@/lib/responses";

// POST /identity/accounts/register/finish
// Two-step registration: caller must first hit /send-verification-email to
// obtain emailVerificationToken, then send the full registration payload here.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");

  const token = body?.emailVerificationToken;
  if (!token) return errorResponse("Missing email verification token");

  const claims = await verifyRegistrationToken(token);
  if (!claims) return errorResponse("Invalid or expired verification token");

  const result = await createUser({
    email: claims.email,
    name: claims.name,
    masterPasswordHash: body.masterPasswordHash,
    masterPasswordHint: body.masterPasswordHint,
    key: body.key,
    privateKey: body.privateKey,
    publicKey: body.publicKey?.encryptedPrivateKey
      ? body.publicKey.encryptedPrivateKey
      : body.publicKey,
    token: body.token, // invite code (when REQUIRE_INVITE_CODE)
    kdfType: body.kdfType ?? body.kdf,
    kdfIterations: body.kdfIterations,
    kdfMemory: body.kdfMemory,
    kdfParallelism: body.kdfParallelism,
  });

  if (!result.ok) {
    switch (result.error.kind) {
      case "missing_fields":
        return errorResponse("Missing required fields");
      case "invite_required":
        return errorResponse("Invitation code is required", 400, {
          token: ["Invitation code is required"],
        });
      case "invite_invalid":
        return errorResponse("Invalid or expired invitation code", 400, {
          token: ["Invalid or expired invitation code"],
        });
      case "email_taken":
        return errorResponse("Email is already registered", 400, {
          email: ["Email is already registered"],
        });
    }
  }

  return jsonResponse(buildProfile(result.user));
}
