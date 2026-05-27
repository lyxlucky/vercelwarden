import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { verifyTotp, generateRecoveryCode } from "@/lib/totp";
import { unauthorized, errorResponse, jsonResponse } from "@/lib/responses";

// PUT /api/two-factor/authenticator — confirm + persist a TOTP secret.
// Body: { masterPasswordHash, key (base32 secret), token (6-digit code) }
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  const hash = body?.masterPasswordHash;
  const key = body?.key;
  const token = body?.token;
  if (!hash || !key || !token) return errorResponse("Missing required fields");

  const pwOk = verifyPassword(
    hash,
    auth.user.passwordHash as Uint8Array,
    auth.user.salt as Uint8Array,
    auth.user.passwordIterations
  );
  if (!pwOk) return errorResponse("Invalid password");

  if (!verifyTotp(key, token)) {
    return errorResponse("Invalid authenticator code", 400, {
      token: ["Invalid code"],
    });
  }

  const recoveryCode = auth.user.totpRecover ?? generateRecoveryCode();

  await db
    .update(users)
    .set({
      totpSecret: key,
      totpRecover: recoveryCode,
      updatedAt: new Date(),
    })
    .where(eq(users.uuid, auth.user.uuid));

  return jsonResponse({
    enabled: true,
    key,
    object: "twoFactorAuthenticator",
  });
}

// POST alias — older clients use POST for the same payload.
export async function POST(request: NextRequest) {
  return PUT(request);
}
