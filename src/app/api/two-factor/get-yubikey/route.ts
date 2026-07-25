import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { twoFactorCredentials } from "@/db/schema";
import { buildCapabilityDocument } from "@/lib/contracts/capabilities";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export async function POST(request: Request) {
  try {
    if (!buildCapabilityDocument().capabilities["auth.yubikey"]) {
      throw new ApiError(404, "not_found", "YubiKey authentication is unavailable.");
    }
    const auth = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    await authorizeAccountMutation({
      request,
      auth,
      purpose: "account.two-factor.manage",
      legacyMasterPasswordHash: body.masterPasswordHash,
    });
    const credentials = await db.select({ uuid: twoFactorCredentials.uuid, name: twoFactorCredentials.name })
      .from(twoFactorCredentials).where(and(
        eq(twoFactorCredentials.userUuid, auth.user.uuid),
        eq(twoFactorCredentials.provider, "yubikey"),
        eq(twoFactorCredentials.status, "active")
      ));
    return Response.json({
      enabled: credentials.length > 0,
      keys: credentials.map((credential) => ({ id: credential.uuid, name: credential.name })),
      object: "twoFactorYubiKey",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
