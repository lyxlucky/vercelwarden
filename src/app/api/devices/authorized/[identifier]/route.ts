import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { assertDeviceManagementEnabled, serializeDevice } from "@/lib/server/devices/service";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";
import { recordAuditEvent } from "@/lib/server/audit/events";

export async function DELETE(request: Request, context: { params: Promise<{ identifier: string }> }) {
  try {
    assertDeviceManagementEnabled();
    const auth = await authenticateRequest(request);
    const { identifier } = await context.params;
    const updated = await db.update(devices).set({ trustedAt: null, trustedUntil: null, updatedAt: new Date() })
      .where(and(eq(devices.userUuid, auth.user.uuid), eq(devices.identifier, identifier)))
      .returning();
    if (updated.length !== 1) throw new ApiError(404, "not_found", "The requested device was not found.");
    await recordAuditEvent({
      action: "device.trust.revoke",
      actorUserUuid: auth.user.uuid,
      actorEmailSnapshot: auth.user.email,
      targetId: updated[0].uuid,
      outcome: "succeeded",
      request,
      metadata: { identifier },
    });
    return Response.json(serializeDevice(updated[0], auth.device.uuid), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
