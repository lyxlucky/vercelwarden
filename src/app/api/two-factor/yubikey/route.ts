import { db } from "@/db";
import { twoFactorCredentials } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { buildCapabilityDocument } from "@/lib/contracts/capabilities";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import { sealServerSecret } from "@/lib/server/auth/server-secrets";
import { verifyYubikeyOtp } from "@/lib/server/auth/two-factor";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export async function PUT(request: Request) {
  try {
    if (!buildCapabilityDocument().capabilities["auth.yubikey"]) {
      throw new ApiError(404, "not_found", "YubiKey authentication is unavailable.");
    }
    const auth = await authenticateRequest(request);
    const body = await request.json().catch(() => null);
    const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
    if (!/^[cbdefghijklnrtuv]{44}$/u.test(otp)) {
      throw new ApiError(400, "validation_error", "A valid YubiKey OTP is required.");
    }
    await authorizeAccountMutation({
      request,
      auth,
      purpose: "account.two-factor.manage",
      legacyMasterPasswordHash: body.masterPasswordHash,
    });
    if (!await verifyYubikeyOtp(otp)) throw new ApiError(400, "yubikey_verification_failed", "The YubiKey could not be verified.");
    const credential = {
      uuid: newUuid(),
      userUuid: auth.user.uuid,
      provider: "yubikey" as const,
      name: typeof body.name === "string" ? body.name.trim().slice(0, 100) || "YubiKey" : "YubiKey",
      status: "active" as const,
      secretCiphertext: sealServerSecret(otp.slice(0, 12)),
      createdAt: new Date(),
    };
    await db.insert(twoFactorCredentials).values(credential);
    return Response.json({ enabled: true, id: credential.uuid, name: credential.name, type: 3, object: "twoFactorProvider" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return PUT(request);
}
