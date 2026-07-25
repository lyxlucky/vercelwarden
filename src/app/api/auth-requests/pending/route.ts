import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { authRequests } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { assertAuthRequestsEnabled, authRequestFingerprint } from "@/lib/server/auth/auth-requests";
import { apiErrorResponse } from "@/lib/server/http/errors";

export async function GET(request: Request) {
  try {
    assertAuthRequestsEnabled();
    const auth = await authenticateRequest(request);
    const now = new Date();
    await db.update(authRequests).set({ status: "expired", respondedAt: now }).where(and(
      eq(authRequests.userUuid, auth.user.uuid),
      eq(authRequests.status, "pending"),
      lte(authRequests.expiresAt, now)
    ));
    const pending = await db.select().from(authRequests).where(and(
      eq(authRequests.userUuid, auth.user.uuid),
      eq(authRequests.status, "pending"),
      gt(authRequests.expiresAt, now)
    ));
    const responderMaterial = auth.user.publicKey ?? auth.device.identifier;
    return Response.json({
      data: pending.map((item) => ({
        id: item.uuid,
        requestDeviceIdentifier: item.requestingDeviceIdentifier,
        requestDeviceType: item.requestingDeviceType,
        requestDeviceId: item.requestingDeviceUuid,
        ipAddress: item.ipAddress,
        countryCode: item.countryCode,
        creationDate: item.createdAt.toISOString(),
        expirationDate: item.expiresAt.toISOString(),
        requestPublicKey: item.publicKey,
        fingerprintPhrase: authRequestFingerprint(item.publicKey, responderMaterial),
        object: "authRequest",
      })),
      continuationToken: null,
      object: "list",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
