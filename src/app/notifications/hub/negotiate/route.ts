import { authenticateNotificationRequest } from "@/lib/server/notifications/authentication";
import { buildNotificationConfiguration } from "@/lib/server/notifications/config";
import { issueNotificationNegotiation } from "@/lib/server/notifications/negotiation";
import { recordNotificationMetric } from "@/lib/server/notifications/observability";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const configuration = buildNotificationConfiguration();
    if (!configuration.websocketReady) {
      throw new ApiError(503, "websocket_notifications_unavailable", configuration.issues.join(" ") || "WebSocket notifications are disabled.");
    }
    const auth = await authenticateNotificationRequest(request);
    recordNotificationMetric("negotiation_attempt", { transport: "websocket" });
    return Response.json(await issueNotificationNegotiation({ userUuid: auth.user.uuid }), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

