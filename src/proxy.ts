import { NextRequest, NextResponse } from "next/server";
import {
  configuredClientOrigins,
  isBrowserExtensionOrigin,
  normalizeClientOrigin,
} from "@/lib/server/notifications/origin";

const DEFAULT_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "Accept",
  "Device-Type",
  "Device-Identifier",
  "Device-Name",
  "Bitwarden-Client-Name",
  "Bitwarden-Client-Version",
  "Bitwarden-Package-Type",
  "Is-Prerelease",
  "X-Request-Email",
  "X-Device-Identifier",
  "X-Device-Name",
  "X-Vercelwarden-Client",
];

const CORS_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";

function isPublicWildcardPath(pathname: string): boolean {
  return pathname === "/config" ||
    pathname === "/api/config" ||
    pathname === "/api/version" ||
    pathname === "/alive" ||
    pathname === "/api/alive" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/api/icons/");
}

function corsOrigin(request: NextRequest): { value: string | null; credentials: boolean } {
  const origin = normalizeClientOrigin(request.headers.get("origin"));
  if (!origin) {
    return isPublicWildcardPath(request.nextUrl.pathname)
      ? { value: "*", credentials: false }
      : { value: null, credentials: false };
  }
  if (origin === request.nextUrl.origin || isBrowserExtensionOrigin(origin) || configuredClientOrigins().has(origin)) {
    return { value: origin, credentials: true };
  }
  return isPublicWildcardPath(request.nextUrl.pathname)
    ? { value: "*", credentials: false }
    : { value: null, credentials: false };
}

function applyCorsHeaders(request: NextRequest, headers: Headers): void {
  const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowHeaders = Array.from(new Set([...DEFAULT_ALLOWED_HEADERS, ...requestedHeaders]));
  const policy = corsOrigin(request);

  headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  headers.set("Access-Control-Allow-Headers", allowHeaders.join(", "));
  headers.set("Access-Control-Expose-Headers", "Content-Disposition, X-Request-Id");
  headers.set("Access-Control-Max-Age", "86400");
  if (policy.value) {
    headers.set("Access-Control-Allow-Origin", policy.value);
    if (policy.credentials) headers.set("Access-Control-Allow-Credentials", "true");
    headers.append("Vary", "Origin, Access-Control-Request-Headers");
  }
}

export function proxy(request: NextRequest): NextResponse {
  const response = request.method === "OPTIONS"
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next();
  applyCorsHeaders(request, response.headers);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/identity/:path*",
    "/notifications/:path*",
    "/icons/:path*",
    "/config",
    "/alive",
  ],
};
