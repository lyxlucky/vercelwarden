import "server-only";

import type { AuthResult } from "@/lib/auth";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { ApiError } from "@/lib/server/http/errors";
import { isAllowedNotificationOrigin } from "@/lib/server/notifications/origin";

export function notificationAuthorizationHeader(request: Pick<Request, "headers" | "url">): string | null {
  const header = request.headers.get("authorization");
  if (header) return header;
  const token = new URL(request.url).searchParams.get("access_token");
  return token ? `Bearer ${token}` : null;
}

export function assertNotificationOrigin(request: Pick<Request, "headers" | "url">): void {
  const url = new URL(request.url);
  if (!isAllowedNotificationOrigin({
    origin: request.headers.get("origin"),
    requestOrigin: url.origin,
  })) {
    throw new ApiError(403, "notification_origin_forbidden", "The notification connection origin is not allowed.");
  }
}

export async function authenticateNotificationRequest(
  request: Pick<Request, "headers" | "url">
): Promise<AuthResult> {
  assertNotificationOrigin(request);
  const headers = new Headers(request.headers);
  const authorization = notificationAuthorizationHeader(request);
  if (authorization) headers.set("authorization", authorization);
  return authenticateRequest({ headers });
}

