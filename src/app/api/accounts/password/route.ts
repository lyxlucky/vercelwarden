import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { hashPassword, newSalt, verifyPassword } from "@/lib/password";
import { unauthorized, errorResponse } from "@/lib/responses";

// POST /api/accounts/password — change master password
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json();
  const masterPasswordHash = body?.masterPasswordHash;
  const newMasterPasswordHash = body?.newMasterPasswordHash;
  const key = body?.key;

  if (!masterPasswordHash || !newMasterPasswordHash || !key) {
    return errorResponse("Missing required fields");
  }

  const ok = verifyPassword(
    masterPasswordHash,
    auth.user.passwordHash as Uint8Array,
    auth.user.salt as Uint8Array,
    auth.user.passwordIterations
  );
  if (!ok) return errorResponse("Invalid current password");

  const salt = newSalt();
  const passwordHash = hashPassword(newMasterPasswordHash, salt);

  await db
    .update(users)
    .set({
      passwordHash,
      salt,
      akey: key,
      securityStamp: newUuid(),
      updatedAt: new Date(),
    })
    .where(eq(users.uuid, auth.user.uuid));

  return new Response(null, { status: 200 });
}
