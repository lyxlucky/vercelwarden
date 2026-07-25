import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { assertDeviceManagementEnabled, serializeDevice } from "@/lib/server/devices/service";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const schema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export async function PUT(request: Request, context: { params: Promise<{ identifier: string }> }) {
  try {
    assertDeviceManagementEnabled();
    const auth = await authenticateRequest(request);
    const { identifier } = await context.params;
    const body = await parseJsonBody(request, schema, 16 * 1024);
    const updated = await db.update(devices).set({ name: body.name, updatedAt: new Date() })
      .where(and(eq(devices.userUuid, auth.user.uuid), eq(devices.identifier, identifier)))
      .returning();
    if (updated.length !== 1) throw new ApiError(404, "not_found", "The requested device was not found.");
    return Response.json(serializeDevice(updated[0], auth.device.uuid), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
