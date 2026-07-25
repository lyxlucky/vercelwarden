import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { twoFactorCredentials } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const providerTypes = { totp: 0, yubikey: 3, webauthn: 7 } as const;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "account.two-factor.manage");
    const { id } = await context.params;
    const body = await parseJsonBody(request, schema, 16 * 1024);
    const updated = await db.update(twoFactorCredentials)
      .set({ name: body.name })
      .where(and(
        eq(twoFactorCredentials.uuid, id),
        eq(twoFactorCredentials.userUuid, auth.user.uuid)
      ))
      .returning();
    if (updated.length !== 1) {
      throw new ApiError(404, "not_found", "The requested two-factor credential was not found.");
    }
    const credential = updated[0];
    return Response.json({
      id: credential.uuid,
      name: credential.name,
      enabled: credential.status === "active",
      status: credential.status,
      type: providerTypes[credential.provider],
      provider: credential.provider,
      creationDate: credential.createdAt.toISOString(),
      lastUsedDate: credential.lastUsedAt?.toISOString() ?? null,
      object: "twoFactorProvider",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
