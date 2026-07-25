import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import { apiErrorResponse } from "@/lib/server/http/errors";
import { buildOtpAuthUri, generateTotpSecret } from "@/lib/totp";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    await authorizeAccountMutation({
      request,
      auth,
      purpose: "account.two-factor.manage",
      legacyMasterPasswordHash: body.masterPasswordHash ?? body.secret,
    });
    const enabled = Boolean(auth.user.totpSecret);
    const key = auth.user.totpSecret ?? generateTotpSecret();
    return Response.json({
      enabled,
      key,
      uri: buildOtpAuthUri(key, auth.user.email),
      object: "twoFactorAuthenticator",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
