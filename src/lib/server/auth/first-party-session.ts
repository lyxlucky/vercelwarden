import "server-only";
import { ApiError } from "@/lib/server/http/errors";
import { hashSecret, verifySecret } from "@/lib/server/auth/secret-hash";

export const FIRST_PARTY_CLIENT_ID = "vercelwarden-web";
export const FIRST_PARTY_REFRESH_COOKIE = "vw_refresh";

export function isFirstPartyClient(clientId: FormDataEntryValue | null): boolean {
  return clientId === FIRST_PARTY_CLIENT_ID;
}

export function assertTrustedOrigin(request: Pick<Request, "headers" | "url">, expectedOrigin: string): void {
  let trusted: URL;
  try {
    trusted = new URL(expectedOrigin);
  } catch {
    throw new ApiError(403, "csrf_origin_mismatch", "The request origin is not trusted.");
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin !== trusted.origin || host !== trusted.host) {
    throw new ApiError(403, "csrf_origin_mismatch", "The request origin is not trusted.");
  }
}

export function firstPartyRefreshCookie(token: string, secure: boolean): string {
  const attributes = [
    `${FIRST_PARTY_REFRESH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/identity/connect",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=2592000",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearFirstPartyRefreshCookie(secure: boolean): string {
  const attributes = [
    `${FIRST_PARTY_REFRESH_COOKIE}=`,
    "Path=/identity/connect",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export async function hashRefreshCredential(token: string): Promise<string> {
  return hashSecret(token, "refresh");
}

export async function verifyRefreshCredential(token: string, encoded: string): Promise<boolean> {
  return verifySecret(token, encoded, "refresh");
}

export type SupportedGrantType =
  | "password"
  | "refresh_token"
  | "client_credentials"
  | "passkey"
  | "urn:vercelwarden:params:oauth:grant-type:passkey";

export function isSupportedGrantType(value: FormDataEntryValue | null): value is SupportedGrantType {
  return value === "password" ||
    value === "refresh_token" ||
    value === "client_credentials" ||
    value === "passkey" ||
    value === "urn:vercelwarden:params:oauth:grant-type:passkey";
}
