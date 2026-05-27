import { NextRequest } from "next/server";
import { createUser } from "@/lib/register";
import { verifyRegistrationToken } from "@/lib/registration-token";
import { jsonResponse, errorResponse } from "@/lib/responses";

// POST /identity/accounts/register/finish
// Body contract (matches Vaultwarden 1.36.0 RegisterData). Field name aliases
// matter — the modern Web Vault sends `userSymmetricKey` / `userAsymmetricKeys`,
// while CLI / older clients send `key` / `keys`. Both must work.
//
// Response is the minimal Vaultwarden shape so the client knows to follow up
// with a fresh /identity/connect/token call (auto-login).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");

  const token = body?.emailVerificationToken;
  if (!token) return errorResponse("Missing email verification token");

  const claims = await verifyRegistrationToken(token);
  if (!claims) return errorResponse("Invalid or expired verification token");

  // Body may include an email; if so it must match the token's claim.
  const bodyEmail = body?.email?.toLowerCase().trim();
  if (bodyEmail && bodyEmail !== claims.email) {
    return errorResponse("Email does not match verification token");
  }

  // Accept both modern (`userAsymmetricKeys`) and legacy (`keys`) field names.
  const keys = body.userAsymmetricKeys ?? body.keys ?? {};
  const symmetricKey = body.userSymmetricKey ?? body.key;

  if (!symmetricKey || !keys.encryptedPrivateKey || !keys.publicKey) {
    return errorResponse("Missing required key material", 400, {
      key: !symmetricKey ? ["userSymmetricKey is required"] : [],
      keys: !keys.encryptedPrivateKey || !keys.publicKey
        ? ["userAsymmetricKeys.{encryptedPrivateKey,publicKey} are required"]
        : [],
    });
  }

  const result = await createUser({
    email: claims.email,
    name: body.name ?? claims.name,
    masterPasswordHash: body.masterPasswordHash,
    masterPasswordHint: body.masterPasswordHint,
    key: symmetricKey,
    privateKey: keys.encryptedPrivateKey,
    publicKey: keys.publicKey,
    token: body.token ?? body.orgInviteToken,
    kdfType: body.kdf,
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

  // Vaultwarden's exact response shape — the client follows up with a
  // password-grant /connect/token call to actually log in.
  return jsonResponse({
    object: "register",
    captchaBypassToken: "",
  });
}
