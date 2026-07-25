import "server-only";
import { createHash } from "node:crypto";
import { buildCapabilityDocument } from "@/lib/contracts/capabilities";
import { ApiError } from "@/lib/server/http/errors";

const words = [
  "amber", "apple", "atlas", "birch", "bloom", "cedar", "cobalt", "coral",
  "delta", "ember", "field", "fjord", "forest", "globe", "harbor", "indigo",
  "jade", "lilac", "maple", "meadow", "north", "ocean", "olive", "pearl",
  "quartz", "river", "sable", "solar", "stone", "tiger", "violet", "willow",
] as const;

export function assertAuthRequestsEnabled(): void {
  if (!buildCapabilityDocument().capabilities["authRequests.approval"]) {
    throw new ApiError(404, "not_found", "Authentication request approval is unavailable.");
  }
}

export function authRequestFingerprint(requestPublicKey: string, responderPublicKey: string): string {
  const digest = createHash("sha256")
    .update("vercelwarden-auth-request-v1\0")
    .update(requestPublicKey)
    .update("\0")
    .update(responderPublicKey)
    .digest();
  return Array.from(digest.subarray(0, 5), (value) => words[value % words.length]).join("-");
}

export function transitionAuthRequest(
  request: { status: "pending" | "approved" | "denied" | "expired"; expiresAt: Date },
  decision: "approved" | "denied",
  now = new Date()
): { status: "approved" | "denied"; respondedAt: Date } {
  if (request.status !== "pending") {
    throw new ApiError(409, "auth_request_already_handled", "The authentication request was already handled.");
  }
  if (request.expiresAt.getTime() <= now.getTime()) {
    throw new ApiError(409, "auth_request_expired", "The authentication request has expired.");
  }
  return { status: decision, respondedAt: now };
}
