import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { db } from "@/db";
import { idempotencyRecords } from "@/db/schema";
import { ApiError } from "@/lib/server/http/errors";
import { fingerprintBody } from "@/lib/server/idempotency/service";

export type WebAuthnSetupScope = "account-passkey" | "two-factor-passkey";

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(value);
}

function recordScope(scope: WebAuthnSetupScope) {
  return `webauthn-setup:${scope}`;
}

export function setupChallengeCookieName(scope: WebAuthnSetupScope) {
  return scope === "account-passkey" ? "vw_account_passkey_setup" : "vw_two_factor_passkey_setup";
}

export function setupChallengeCookie(scope: WebAuthnSetupScope, token: string, secure: boolean, clear = false): string {
  return [
    `${setupChallengeCookieName(scope)}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${clear ? 0 : 300}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export async function issueWebAuthnSetupChallenge(input: {
  scope: WebAuthnSetupScope;
  userUuid: string;
  challenge: string;
}) {
  const jti = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60_000);
  await db.insert(idempotencyRecords).values({
    uuid: randomUUID(),
    userUuid: input.userUuid,
    scope: recordScope(input.scope),
    key: jti,
    requestHash: await fingerprintBody(input.challenge),
    status: "pending",
    createdAt: now,
    expiresAt,
  });
  const token = await new SignJWT({ scope: input.scope, challenge: input.challenge })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userUuid)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  return { token, expiresAt };
}

export async function consumeWebAuthnSetupChallenge(input: {
  scope: WebAuthnSetupScope;
  userUuid: string;
  token?: string;
}): Promise<string> {
  if (!input.token) throw new ApiError(400, "passkey_challenge_invalid", "The Passkey challenge is invalid or expired.");
  let challenge: string;
  let jti: string;
  try {
    const { payload } = await jwtVerify(input.token, secret());
    if (payload.scope !== input.scope || payload.sub !== input.userUuid || typeof payload.challenge !== "string" || !payload.jti) {
      throw new Error("Invalid setup challenge claims");
    }
    challenge = payload.challenge;
    jti = payload.jti;
  } catch {
    throw new ApiError(400, "passkey_challenge_invalid", "The Passkey challenge is invalid or expired.");
  }
  await db.transaction(async (tx) => {
    const [record] = await tx.select().from(idempotencyRecords).where(and(
      eq(idempotencyRecords.scope, recordScope(input.scope)),
      eq(idempotencyRecords.key, jti),
      eq(idempotencyRecords.userUuid, input.userUuid),
      eq(idempotencyRecords.status, "pending"),
      gt(idempotencyRecords.expiresAt, new Date())
    )).limit(1);
    if (!record || record.requestHash !== await fingerprintBody(challenge)) {
      throw new ApiError(400, "passkey_challenge_invalid", "The Passkey challenge is invalid or expired.");
    }
    await tx.update(idempotencyRecords).set({ status: "completed", responseStatus: 204, responseBody: "{}" })
      .where(eq(idempotencyRecords.uuid, record.uuid));
  });
  return challenge;
}
