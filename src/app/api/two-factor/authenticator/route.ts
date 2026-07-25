import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { recoveryCodeHashes, twoFactorCredentials, users } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import { hashRecoveryCode } from "@/lib/server/auth/recovery-codes";
import { sealServerSecret } from "@/lib/server/auth/server-secrets";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";
import { generateRecoveryCode, verifyTotp } from "@/lib/totp";

export async function PUT(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json().catch(() => null);
    if (!body?.key || !body?.token) throw new ApiError(400, "validation_error", "Key and authenticator code are required.");
    await authorizeAccountMutation({
      request,
      auth,
      purpose: "account.two-factor.manage",
      legacyMasterPasswordHash: body.masterPasswordHash,
    });
    if (!verifyTotp(body.key, body.token)) {
      throw new ApiError(400, "invalid_authenticator_code", "The authenticator code is invalid.", { token: ["Invalid code"] });
    }
    const recoveryCode = generateRecoveryCode();
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(twoFactorCredentials).set({ status: "disabled" }).where(and(
        eq(twoFactorCredentials.userUuid, auth.user.uuid),
        eq(twoFactorCredentials.provider, "totp"),
        eq(twoFactorCredentials.status, "active")
      ));
      await tx.insert(twoFactorCredentials).values({
        uuid: newUuid(),
        userUuid: auth.user.uuid,
        provider: "totp",
        name: typeof body.name === "string" ? body.name.trim().slice(0, 100) || "Authenticator" : "Authenticator",
        status: "active",
        secretCiphertext: sealServerSecret(body.key),
        createdAt: now,
      });
      await tx.insert(recoveryCodeHashes).values({
        uuid: newUuid(),
        userUuid: auth.user.uuid,
        codeHash: await hashRecoveryCode(recoveryCode),
        createdAt: now,
      });
      await tx.update(users).set({ totpSecret: body.key, totpRecover: recoveryCode, updatedAt: now })
        .where(eq(users.uuid, auth.user.uuid));
    });
    return Response.json({
      enabled: true,
      key: body.key,
      recoveryCode,
      object: "twoFactorAuthenticator",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return PUT(request);
}
