import "server-only";

import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

const TOKEN_ISSUER = "Vercelwarden";
const TOKEN_AUDIENCE = "vercelwarden:notifications";

export interface NegotiationEnvironment {
  [key: string]: string | undefined;
  JWT_SECRET?: string;
}

function secret(env: NegotiationEnvironment): Uint8Array {
  const value = env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function issueNotificationNegotiation(input: {
  userUuid: string;
  now?: Date;
  env?: NegotiationEnvironment;
}) {
  const connectionId = randomUUID();
  const env = input.env ?? process.env;
  const now = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  const connectionToken = await new SignJWT({ scope: "notifications-hub", connectionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userUuid)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .sign(secret(env));
  return {
    negotiateVersion: 1,
    connectionId,
    connectionToken,
    availableTransports: [
      { transport: "WebSockets", transferFormats: ["Text", "Binary"] },
    ],
  } as const;
}

export async function verifyNotificationNegotiationToken(input: {
  token: string;
  userUuid: string;
  env?: NegotiationEnvironment;
}): Promise<{ connectionId: string } | null> {
  try {
    const { payload } = await jwtVerify(input.token, secret(input.env ?? process.env), {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    if (payload.scope !== "notifications-hub" || payload.sub !== input.userUuid) return null;
    if (typeof payload.connectionId !== "string" || !payload.connectionId) return null;
    return { connectionId: payload.connectionId };
  } catch {
    return null;
  }
}
