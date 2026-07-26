import { connection } from "next/server";
import { authenticateNotificationRequest } from "@/lib/server/notifications/authentication";
import { buildNotificationConfiguration } from "@/lib/server/notifications/config";
import { verifyNotificationNegotiationToken } from "@/lib/server/notifications/negotiation";
import { runSignalRSession } from "@/lib/server/notifications/signalr-session";
import { upgradeNotificationWebSocket } from "@/lib/server/notifications/websocket-upgrade";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  await connection();
  try {
    const configuration = buildNotificationConfiguration();
    if (!configuration.websocketReady) {
      throw new ApiError(503, "websocket_notifications_unavailable", configuration.issues.join(" ") || "WebSocket notifications are disabled.");
    }
    const auth = await authenticateNotificationRequest(request);
    const negotiationToken = new URL(request.url).searchParams.get("id");
    if (negotiationToken) {
      const negotiation = await verifyNotificationNegotiationToken({
        token: negotiationToken,
        userUuid: auth.user.uuid,
      });
      if (!negotiation) {
        throw new ApiError(401, "notification_connection_invalid", "The notification connection token is invalid or expired.");
      }
    }
    return upgradeNotificationWebSocket((socket) => runSignalRSession({
      socket,
      userUuid: auth.user.uuid,
      deviceIdentifier: auth.device.identifier,
    }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
