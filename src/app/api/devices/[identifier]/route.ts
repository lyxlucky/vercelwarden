import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { authRequests, devices } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { assertDeviceActionAllowed, assertDeviceManagementEnabled } from "@/lib/server/devices/service";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";
import { recordAuditEvent } from "@/lib/server/audit/events";

export async function DELETE(request: Request, context: { params: Promise<{ identifier: string }> }) {
  try {
    assertDeviceManagementEnabled();
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "device.remove");
    const { identifier } = await context.params;
    assertDeviceActionAllowed({ action: "remove", targetIdentifier: identifier, currentIdentifier: auth.device.identifier });
    const removed = await db.transaction(async (tx) => {
      const deleted = await tx.delete(devices)
        .where(and(eq(devices.userUuid, auth.user.uuid), eq(devices.identifier, identifier)))
        .returning({ uuid: devices.uuid });
      if (deleted.length !== 1) throw new ApiError(404, "not_found", "The requested device was not found.");
      await tx.update(authRequests).set({ status: "denied", respondedAt: new Date() })
        .where(and(
          eq(authRequests.userUuid, auth.user.uuid),
          eq(authRequests.requestingDeviceIdentifier, identifier),
          eq(authRequests.status, "pending")
        ));
      return deleted[0];
    });
    await recordAuditEvent({
      action: "device.remove",
      actorUserUuid: auth.user.uuid,
      actorEmailSnapshot: auth.user.email,
      targetId: removed.uuid,
      outcome: "succeeded",
      request,
      metadata: { identifier },
    });
    return Response.json({ object: "deviceRemoval", id: removed.uuid, identifier, removed: true }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
