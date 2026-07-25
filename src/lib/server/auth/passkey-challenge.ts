import "server-only";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyRecords } from "@/db/schema";
import { ApiError } from "@/lib/server/http/errors";
import { fingerprintBody } from "@/lib/server/idempotency/service";

export const PASSKEY_CHALLENGE_COOKIE = "vw_passkey_challenge";
const CHALLENGE_SCOPE = "account-passkey-assertion";

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function issuePasskeyChallenge(challenge: string) {
  const jti = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
  await db.insert(idempotencyRecords).values({
    uuid: randomUUID(),
    userUuid: null,
    scope: CHALLENGE_SCOPE,
    key: jti,
    requestHash: await fingerprintBody(challenge),
    status: "pending",
    createdAt: now,
    expiresAt,
  });
  const token = await new SignJWT({ purpose: CHALLENGE_SCOPE, challenge })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  return { token, expiresAt };
}

export function passkeyChallengeCookie(token: string, secure: boolean): string {
  return [
    `${PASSKEY_CHALLENGE_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/identity/connect",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=300",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function clearPasskeyChallengeCookie(secure: boolean): string {
  return [
    `${PASSKEY_CHALLENGE_COOKIE}=`,
    "Path=/identity/connect",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export async function verifyAndConsumePasskeyChallenge(token: string | undefined) {
  if (!token) throw new ApiError(400, "passkey_challenge_invalid", "The Passkey challenge is invalid or expired.");
  let challenge: string;
  let jti: string;
  try {
    const verified = await jwtVerify(token, secret());
    if (verified.payload.purpose !== CHALLENGE_SCOPE || typeof verified.payload.challenge !== "string" || !verified.payload.jti) {
      throw new Error("Invalid challenge claims");
    }
    challenge = verified.payload.challenge;
    jti = verified.payload.jti;
  } catch {
    throw new ApiError(400, "passkey_challenge_invalid", "The Passkey challenge is invalid or expired.");
  }

  await db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(idempotencyRecords)
      .where(and(
        eq(idempotencyRecords.scope, CHALLENGE_SCOPE),
        eq(idempotencyRecords.key, jti),
        eq(idempotencyRecords.status, "pending"),
        gt(idempotencyRecords.expiresAt, new Date())
      ))
      .limit(1);
    if (!record || record.requestHash !== await fingerprintBody(challenge)) {
      throw new ApiError(400, "passkey_challenge_invalid", "The Passkey challenge is invalid or expired.");
    }
    await tx
      .update(idempotencyRecords)
      .set({ status: "completed", responseStatus: 204, responseBody: "{}" })
      .where(eq(idempotencyRecords.uuid, record.uuid));
  });
  return challenge;
}

