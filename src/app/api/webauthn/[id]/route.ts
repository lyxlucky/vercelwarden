import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accountPasskeys } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  directUnlock: z.boolean(),
  encryptedUserKey: z.string().min(1).max(16 * 1024).nullable().optional(),
  encryptedPrivateKey: z.string().max(16 * 1024).nullable().optional(),
}).strict();

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "account.passkey.manage");
    const { id } = await context.params;
    const body = await parseJsonBody(request, schema, 48 * 1024);
    if (body.directUnlock && !body.encryptedUserKey) {
      throw new ApiError(400, "passkey_direct_unlock_invalid", "Direct unlock requires an encrypted user key.");
    }
    const updated = await db.update(accountPasskeys).set({
      name: body.name,
      directUnlock: body.directUnlock,
      encryptedUserKey: body.directUnlock ? body.encryptedUserKey ?? null : null,
      encryptedPrivateKey: body.directUnlock ? body.encryptedPrivateKey ?? null : null,
      updatedAt: new Date(),
    }).where(and(eq(accountPasskeys.uuid, id), eq(accountPasskeys.userUuid, auth.user.uuid))).returning();
    if (updated.length !== 1) throw new ApiError(404, "not_found", "The requested Passkey was not found.");
    return Response.json({ object: "accountPasskey", id, name: body.name, directUnlock: body.directUnlock }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "account.passkey.manage");
    const { id } = await context.params;
    const deleted = await db.delete(accountPasskeys)
      .where(and(eq(accountPasskeys.uuid, id), eq(accountPasskeys.userUuid, auth.user.uuid)))
      .returning({ id: accountPasskeys.uuid });
    if (deleted.length !== 1) throw new ApiError(404, "not_found", "The requested Passkey was not found.");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
