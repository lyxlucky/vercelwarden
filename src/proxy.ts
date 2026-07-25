import { NextRequest, NextResponse } from "next/server";

const OFFICIAL_BITWARDEN_DESKTOP_ORIGINS = new Set([
  "bw-desktop-file://bundle",
]);

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

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!url.protocol || !url.host) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function configuredOrigins(): Set<string> {
  const origins = new Set(OFFICIAL_BITWARDEN_DESKTOP_ORIGINS);
  for (const value of (process.env.BROWSER_EXTENSION_ORIGINS ?? "").split(",")) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

function isBrowserExtensionOrigin(origin: string): boolean {
  try {
    return new URL(origin).protocol.endsWith("-extension:");
  } catch {
    return false;
  }
}

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
  const origin = normalizeOrigin(request.headers.get("origin"));
  if (!origin) {
    return isPublicWildcardPath(request.nextUrl.pathname)
      ? { value: "*", credentials: false }
      : { value: null, credentials: false };
  }
  if (origin === request.nextUrl.origin || isBrowserExtensionOrigin(origin) || configuredOrigins().has(origin)) {
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
