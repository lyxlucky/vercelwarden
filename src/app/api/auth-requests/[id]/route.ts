import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { authRequests } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import {
  assertAuthRequestsEnabled,
  authRequestFingerprint,
  transitionAuthRequest,
} from "@/lib/server/auth/auth-requests";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({
  approved: z.boolean().optional(),
  status: z.enum(["approved", "denied"]).optional(),
  encryptedKey: z.string().min(1).max(16 * 1024).optional(),
}).strict();

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertAuthRequestsEnabled();
    const auth = await authenticateRequest(request);
    const { id } = await context.params;
    const body = await parseJsonBody(request, schema, 32 * 1024);
    const decision = body.status ?? (body.approved === true ? "approved" : body.approved === false ? "denied" : null);
    if (!decision) throw new ApiError(400, "validation_error", "An approval decision is required.");
    if (decision === "approved" && !body.encryptedKey) {
      throw new ApiError(400, "validation_error", "An encrypted key is required for approval.");
    }
    const [owned] = await db.select().from(authRequests).where(and(
      eq(authRequests.uuid, id),
      eq(authRequests.userUuid, auth.user.uuid)
    )).limit(1);
    if (!owned) throw new ApiError(404, "not_found", "The requested authentication request was not found.");
    const transition = transitionAuthRequest(owned, decision, new Date());
    const updated = await db.update(authRequests).set({
      ...transition,
      encryptedKey: decision === "approved" ? body.encryptedKey : null,
      respondingDeviceUuid: auth.device.uuid,
    }).where(and(
      eq(authRequests.uuid, owned.uuid),
      eq(authRequests.userUuid, auth.user.uuid),
      eq(authRequests.status, "pending"),
      gt(authRequests.expiresAt, transition.respondedAt)
    )).returning();
    if (updated.length !== 1) {
      throw new ApiError(409, "auth_request_already_handled", "The authentication request was already handled.");
    }
    return Response.json({
      object: "authRequest",
      id: owned.uuid,
      status: decision,
      approved: decision === "approved",
      responseDate: transition.respondedAt.toISOString(),
      fingerprintPhrase: authRequestFingerprint(owned.publicKey, auth.user.publicKey ?? auth.device.identifier),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
