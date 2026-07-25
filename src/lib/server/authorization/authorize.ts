import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { verifyAuth, type AuthResult } from "@/lib/auth";
import { ApiError } from "@/lib/server/http/errors";

export type UserRole = "user" | "admin";

export async function authenticateRequest(request: Pick<Request, "headers">): Promise<AuthResult> {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) throw new ApiError(401, "unauthorized", "Authentication is required.");
  return auth;
}

export function roleOf(auth: AuthResult): UserRole {
  return (auth.user as typeof auth.user & { role?: UserRole }).role === "admin" ? "admin" : "user";
}

export function requireRole(auth: AuthResult, role: UserRole): AuthResult {
  if (roleOf(auth) !== role) {
    throw new ApiError(403, "forbidden", "You do not have permission to perform this action.");
  }
  return auth;
}

export function assertOwner(resourceUserUuid: string | null | undefined, actorUserUuid: string): void {
  if (!resourceUserUuid || resourceUserUuid !== actorUserUuid) {
    throw new ApiError(404, "not_found", "The requested resource was not found.");
  }
}

export function assertCurrentDevice(auth: AuthResult, deviceUuid: string): void {
  if (auth.device.uuid !== deviceUuid) {
    throw new ApiError(403, "current_device_required", "This action must be performed by the current device.");
  }
}

export function assertSecurityStamp(
  presentedStamp: string | null | undefined,
  currentStamp: string
): void {
  const presentedDigest = createHash("sha256").update(presentedStamp ?? "").digest();
  const currentDigest = createHash("sha256").update(currentStamp).digest();
  if (!presentedStamp || !timingSafeEqual(presentedDigest, currentDigest)) {
    throw new ApiError(401, "security_stamp_mismatch", "The session security state has changed.");
  }
}
