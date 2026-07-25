import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { assertDeviceManagementEnabled, serializeDevice } from "@/lib/server/devices/service";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export async function POST(request: Request, context: { params: Promise<{ identifier: string }> }) {
  try {
    assertDeviceManagementEnabled();
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "device.trust");
    const { identifier } = await context.params;
    const now = new Date();
    const updated = await db.update(devices).set({ trustedAt: now, trustedUntil: null, updatedAt: now })
      .where(and(eq(devices.userUuid, auth.user.uuid), eq(devices.identifier, identifier), isNull(devices.revokedAt)))
      .returning();
    if (updated.length !== 1) throw new ApiError(404, "not_found", "The requested device was not found.");
    return Response.json(serializeDevice(updated[0], auth.device.uuid), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
