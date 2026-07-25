import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { authRequests, devices } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { assertDeviceActionAllowed, assertDeviceManagementEnabled } from "@/lib/server/devices/service";
import { apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";

const bulkRemovalSchema = z.object({
  identifiers: z.array(z.string().trim().min(1).max(200)).min(1).max(1000),
}).strict();

export async function DELETE(request: Request) {
  try {
    assertDeviceManagementEnabled();
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "device.remove");
    const selected = request.headers.get("content-type")?.startsWith("application/json")
      ? (await parseJsonBody(request, bulkRemovalSchema, 128 * 1024)).identifiers
      : null;
    const identifiers = selected ? [...new Set(selected)] : null;
    for (const identifier of identifiers ?? []) {
      assertDeviceActionAllowed({
        action: "remove",
        targetIdentifier: identifier,
        currentIdentifier: auth.device.identifier,
      });
    }
    const removed = await db.transaction(async (tx) => {
      const deleted = await tx.delete(devices)
        .where(identifiers
          ? and(eq(devices.userUuid, auth.user.uuid), inArray(devices.identifier, identifiers))
          : and(eq(devices.userUuid, auth.user.uuid), ne(devices.uuid, auth.device.uuid)))
        .returning({ identifier: devices.identifier });
      const removedIdentifiers = deleted.map((device) => device.identifier);
      if (removedIdentifiers.length > 0) {
        await tx.update(authRequests).set({ status: "denied", respondedAt: new Date() })
          .where(and(
            eq(authRequests.userUuid, auth.user.uuid),
            eq(authRequests.status, "pending"),
            inArray(authRequests.requestingDeviceIdentifier, removedIdentifiers)
          ));
      }
      return deleted;
    });
    const removedIdentifiers = new Set(removed.map((device) => device.identifier));
    return Response.json({
      object: "bulkDeviceRemoval",
      removed: removed.length,
      outcomes: identifiers?.map((identifier) => ({
        identifier,
        status: removedIdentifiers.has(identifier) ? "removed" : "not_found",
      })),
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
