import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import {
  hashPassword,
  newSalt,
  DEFAULT_SERVER_PBKDF2_ITER,
} from "@/lib/password";
import { unauthorized, errorResponse, jsonResponse } from "@/lib/responses";

// POST /api/accounts/set-password — used by SSO/key-connector flows where the
// account exists without a master password. Sets one for the first time.
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json();
  const { masterPasswordHash, key, masterPasswordHint, privateKey, publicKey } = body;
  if (!masterPasswordHash || !key) return errorResponse("Missing required fields");

  const salt = newSalt();
  const passwordHash = hashPassword(masterPasswordHash, salt);

  await db
    .update(users)
    .set({
      passwordHash,
      salt,
      passwordIterations: DEFAULT_SERVER_PBKDF2_ITER,
      akey: key,
      passwordHint: masterPasswordHint ?? null,
      privateKey: privateKey ?? auth.user.privateKey,
      publicKey: publicKey ?? auth.user.publicKey,
      securityStamp: newUuid(),
      updatedAt: new Date(),
    })
    .where(eq(users.uuid, auth.user.uuid));

  return jsonResponse({ Object: "set-password" });
}
