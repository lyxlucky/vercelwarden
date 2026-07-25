import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { writeAuditEvent } from "@/lib/server/audit/service";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeAdminRequest(request, { purpose: "admin.user.delete", allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const { id } = await context.params;
    if (id === authorization.auth.user.uuid) throw new ApiError(409, "current_admin_protected", "The current administrator cannot delete their own account.");
    const deleted = await db.delete(users).where(eq(users.uuid, id)).returning({ id: users.uuid, email: users.email });
    if (deleted.length !== 1) throw new ApiError(404, "not_found", "The requested user was not found.");
    await writeAuditEvent({
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      action: "admin.user.delete",
      category: "user",
      level: "critical",
      targetType: "user",
      targetId: id,
      outcome: "succeeded",
    });
    return Response.json({ id, removed: true, object: "adminUserRemoval" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
