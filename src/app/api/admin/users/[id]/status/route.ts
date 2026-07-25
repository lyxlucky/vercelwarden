import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { devices, users } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { writeAuditEvent } from "@/lib/server/audit/service";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({ enabled: z.boolean() }).strict();

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authorization = await authorizeAdminRequest(request, { purpose: "admin.user.status", allowLegacyRead: false });
    if (!authorization.auth) throw new ApiError(401, "unauthorized", "Bearer administrator authentication is required.");
    const { id } = await context.params;
    if (id === authorization.auth.user.uuid) throw new ApiError(409, "current_admin_protected", "The current administrator cannot disable their own account.");
    const body = await parseJsonBody(request, schema, 16 * 1024);
    const updated = await db.transaction(async (tx) => {
      const rows = await tx.update(users).set({ enabled: body.enabled, updatedAt: new Date() })
        .where(eq(users.uuid, id)).returning();
      if (rows.length !== 1) throw new ApiError(404, "not_found", "The requested user was not found.");
      if (!body.enabled) {
        await tx.update(devices).set({ revokedAt: new Date(), refreshToken: "", refreshTokenHash: null, updatedAt: new Date() })
          .where(eq(devices.userUuid, id));
      }
      return rows[0];
    });
    await writeAuditEvent({
      actorUserUuid: authorization.auth.user.uuid,
      actorEmailSnapshot: authorization.auth.user.email,
      action: "admin.user.status",
      category: "user",
      level: body.enabled ? "warning" : "critical",
      targetType: "user",
      targetId: id,
      outcome: "succeeded",
      metadata: { enabled: body.enabled },
      allowedMetadata: ["enabled"],
    });
    return Response.json({ id, email: updated.email, enabled: updated.enabled, object: "adminUser" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
