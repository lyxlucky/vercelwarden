import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { db } from "@/db";
import { reauthProofNonces } from "@/db/schema";
import type { AuthResult } from "@/lib/auth";
import type { ReauthPurpose } from "@/lib/contracts/account-security";
import { ApiError } from "@/lib/server/http/errors";

export const REAUTH_MAX_AGE_SECONDS = 5 * 60;
const ISSUER = "Vercelwarden";
const AUDIENCE = "Vercelwarden Reauthentication";

interface ReauthBinding {
  userUuid: string;
  deviceUuid: string;
  securityStamp: string;
}

interface SignInput extends ReauthBinding {
  purpose: ReauthPurpose;
  nonce: string;
  secret: Uint8Array;
  now?: number;
}

interface VerifyInput extends ReauthBinding {
  purpose: ReauthPurpose;
  secret: Uint8Array;
  now?: number;
  consumeNonce: (claims: ReauthClaims) => Promise<boolean>;
}

export interface ReauthClaims extends ReauthBinding {
  purpose: ReauthPurpose;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

let cachedSecret: Uint8Array | null = null;
function reauthSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const value = process.env.REAUTH_SECRET ?? process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("REAUTH_SECRET or JWT_SECRET must contain at least 32 characters.");
  cachedSecret = new TextEncoder().encode(value);
  return cachedSecret;
}

function invalidProof(code = "reauth_proof_invalid", message = "Reauthentication is required."): ApiError {
  return new ApiError(401, code, message);
}

export async function signReauthenticationProof(input: SignInput) {
  const issuedAt = input.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + REAUTH_MAX_AGE_SECONDS;
  const proof = await new SignJWT({
    device: input.deviceUuid,
    purpose: input.purpose,
    sstamp: input.securityStamp,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userUuid)
    .setJti(input.nonce)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(input.secret);
  return { proof, issuedAt, expiresAt };
}

export async function verifyReauthenticationProof(proof: string, input: VerifyInput): Promise<ReauthClaims> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    payload = (await jwtVerify(proof, input.secret, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: new Date(now * 1000),
    })).payload;
  } catch {
    throw invalidProof();
  }
  if (!payload.sub || typeof payload.device !== "string" || typeof payload.purpose !== "string" ||
      typeof payload.sstamp !== "string" || typeof payload.jti !== "string" ||
      typeof payload.iat !== "number" || typeof payload.exp !== "number" ||
      payload.exp - payload.iat > REAUTH_MAX_AGE_SECONDS) {
    throw invalidProof();
  }
  if (payload.sub !== input.userUuid || payload.device !== input.deviceUuid) {
    throw new ApiError(403, "reauth_binding_mismatch", "The reauthentication proof belongs to another session.");
  }
  if (payload.sstamp !== input.securityStamp) {
    throw invalidProof("reauth_security_state_changed", "The account security state changed.");
  }
  if (payload.purpose !== input.purpose) {
    throw new ApiError(403, "reauth_purpose_mismatch", "The reauthentication proof cannot authorize this action.");
  }
  const claims: ReauthClaims = {
    userUuid: payload.sub,
    deviceUuid: payload.device,
    securityStamp: payload.sstamp,
    purpose: payload.purpose as ReauthPurpose,
    nonce: payload.jti,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
  if (!await input.consumeNonce(claims)) {
    throw new ApiError(409, "reauth_proof_replayed", "The reauthentication proof was already used.");
  }
  return claims;
}

function binding(auth: AuthResult): ReauthBinding {
  return {
    userUuid: auth.user.uuid,
    deviceUuid: auth.device.uuid,
    securityStamp: auth.user.securityStamp,
  };
}

export async function issueReauthProof(auth: AuthResult, purpose: ReauthPurpose) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const expiresAt = now + REAUTH_MAX_AGE_SECONDS;
  await db.insert(reauthProofNonces).values({
    uuid: nonce,
    ...binding(auth),
    purpose,
    createdAt: new Date(now * 1000),
    expiresAt: new Date(expiresAt * 1000),
  });
  return signReauthenticationProof({ ...binding(auth), purpose, nonce, now, secret: reauthSecret() });
}

export async function consumeReauthProof(request: Request, auth: AuthResult, purpose: ReauthPurpose) {
  const proof = request.headers.get("x-reauth-proof");
  if (!proof) throw invalidProof();
  return verifyReauthenticationProof(proof, {
    ...binding(auth),
    purpose,
    secret: reauthSecret(),
    consumeNonce: async (claims) => db.transaction(async (tx) => {
      const now = new Date();
      const consumed = await tx
        .update(reauthProofNonces)
        .set({ consumedAt: now })
        .where(and(
          eq(reauthProofNonces.uuid, claims.nonce),
          eq(reauthProofNonces.userUuid, claims.userUuid),
          eq(reauthProofNonces.deviceUuid, claims.deviceUuid),
          eq(reauthProofNonces.purpose, claims.purpose),
          eq(reauthProofNonces.securityStamp, claims.securityStamp),
          isNull(reauthProofNonces.consumedAt),
          gt(reauthProofNonces.expiresAt, now)
        ))
        .returning({ uuid: reauthProofNonces.uuid });
      return consumed.length === 1;
    }),
  });
}
