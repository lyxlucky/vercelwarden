import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { twoFactorCredentials, users } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

const providers = new Map<number, "totp" | "yubikey" | "webauthn">([[0, "totp"], [3, "yubikey"], [7, "webauthn"]]);

export async function PUT(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json().catch(() => null);
    const provider = providers.get(Number(body?.type));
    if (!provider) throw new ApiError(400, "validation_error", "The two-factor provider type is invalid.");
    await authorizeAccountMutation({
      request,
      auth,
      purpose: "account.two-factor.manage",
      legacyMasterPasswordHash: body?.masterPasswordHash,
    });
    await db.transaction(async (tx) => {
      await tx.update(twoFactorCredentials).set({ status: "disabled" }).where(and(
        eq(twoFactorCredentials.userUuid, auth.user.uuid),
        eq(twoFactorCredentials.provider, provider)
      ));
      if (provider === "totp") {
        await tx.update(users).set({ totpSecret: null, updatedAt: new Date() }).where(eq(users.uuid, auth.user.uuid));
      }
    });
    return Response.json({ enabled: false, type: Number(body.type), object: "twoFactorProvider" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return PUT(request);
}
