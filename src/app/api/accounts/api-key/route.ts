import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { apiErrorResponse } from "@/lib/server/http/errors";
import { recordAuditEvent } from "@/lib/server/audit/events";

async function revealOrRotate(request: Request, rotate: boolean) {
  try {
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "account.api-key.rotate");
    let apiKey = auth.user.apiKey;
    if (rotate || !apiKey) {
      apiKey = newUuid().replaceAll("-", "");
      await db.update(users).set({ apiKey, updatedAt: new Date() }).where(eq(users.uuid, auth.user.uuid));
    }
    await recordAuditEvent({
      action: rotate ? "account.api_key.rotate" : "account.api_key.reveal",
      actorUserUuid: auth.user.uuid,
      actorEmailSnapshot: auth.user.email,
      targetId: auth.user.uuid,
      outcome: "succeeded",
      request,
    });
    return Response.json({ object: "apiKey", apiKey }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return revealOrRotate(request, false);
}

export async function POST(request: Request) {
  return revealOrRotate(request, true);
}
