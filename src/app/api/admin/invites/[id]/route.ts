import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adminInvites } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { writeAuditEvent } from "@/lib/server/audit/service";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeAdminRequest(request, { allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const { id } = await context.params;
    const updated = await db.update(adminInvites).set({ revokedAt: new Date() })
      .where(and(eq(adminInvites.uuid, id), isNull(adminInvites.revokedAt)))
      .returning({ id: adminInvites.uuid });
    if (updated.length !== 1) throw new ApiError(404, "not_found", "The requested active invitation was not found.");
    await writeAuditEvent({
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      action: "admin.invite.revoke",
      category: "user",
      level: "warning",
      targetType: "adminInvite",
      targetId: id,
      outcome: "succeeded",
    });
    return Response.json({ id, revoked: true, object: "adminInvite" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
