import { eq } from "drizzle-orm";
import { db } from "@/db";
import { twoFactorCredentials } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { apiErrorResponse } from "@/lib/server/http/errors";

const providerTypes = { totp: 0, yubikey: 3, webauthn: 7 } as const;

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const credentials = await db.select().from(twoFactorCredentials)
      .where(eq(twoFactorCredentials.userUuid, auth.user.uuid));
    const data = credentials.map((credential) => ({
      id: credential.uuid,
      name: credential.name,
      enabled: credential.status === "active",
      status: credential.status,
      type: providerTypes[credential.provider],
      provider: credential.provider,
      creationDate: credential.createdAt.toISOString(),
      lastUsedDate: credential.lastUsedAt?.toISOString() ?? null,
      object: "twoFactorProvider",
    }));
    if (auth.user.totpSecret && !credentials.some((credential) => credential.provider === "totp" && credential.status === "active")) {
      data.unshift({
        id: "legacy-totp",
        name: "Authenticator",
        enabled: true,
        status: "active",
        type: 0,
        provider: "totp",
        creationDate: auth.user.createdAt.toISOString(),
        lastUsedDate: null,
        object: "twoFactorProvider",
      });
    }
    return Response.json({ data, object: "list", continuationToken: null }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
