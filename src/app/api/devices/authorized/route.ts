import { eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { assertDeviceManagementEnabled, serializeDevice } from "@/lib/server/devices/service";
import { apiErrorResponse } from "@/lib/server/http/errors";
import { recordAuditEvent } from "@/lib/server/audit/events";

export async function GET(request: Request) {
  try {
    assertDeviceManagementEnabled();
    const auth = await authenticateRequest(request);
    const owned = await db.select().from(devices).where(eq(devices.userUuid, auth.user.uuid));
    return Response.json({
      data: owned.map((device) => serializeDevice(device, auth.device.uuid)),
      continuationToken: null,
      object: "list",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertDeviceManagementEnabled();
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "device.trust");
    const now = new Date();
    const changed = await db.update(devices).set({ trustedAt: null, trustedUntil: null, updatedAt: now })
      .where(eq(devices.userUuid, auth.user.uuid)).returning({ identifier: devices.identifier });
    await recordAuditEvent({
      action: "device.trust.revoke_all",
      actorUserUuid: auth.user.uuid,
      actorEmailSnapshot: auth.user.email,
      targetId: auth.user.uuid,
      outcome: "succeeded",
      request,
      metadata: { count: changed.length },
    });
    return Response.json({ object: "bulkDeviceTrust", changed: changed.length }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
