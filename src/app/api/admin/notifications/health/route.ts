import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { apiErrorResponse } from "@/lib/server/http/errors";
import { buildNotificationConfiguration } from "@/lib/server/notifications/config";
import { notificationOperationalSnapshot } from "@/lib/server/notifications/observability";
import { notificationBusHealth } from "@/lib/server/notifications/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request, { allowLegacyRead: false });
    const configuration = buildNotificationConfiguration();
    const bus = await notificationBusHealth();
    return Response.json({
      object: "notificationHealth",
      mode: configuration.effectiveMode,
      requestedMode: configuration.requestedMode,
      websocketReady: configuration.websocketReady,
      runtimeReady: configuration.websocketRuntimeConfigured,
      broker: bus,
      issues: configuration.issues,
      operations: notificationOperationalSnapshot(),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
