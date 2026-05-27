import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";

// POST /api/accounts/password — change master password
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json();
  const masterPasswordHash = body?.masterPasswordHash;
  const newMasterPasswordHash = body?.newMasterPasswordHash;
  const key = body?.key; // new encrypted symmetric key

  if (!masterPasswordHash || !newMasterPasswordHash || !key) {
    return errorResponse("Missing required fields");
  }

  // Verify current password
  if (masterPasswordHash !== Buffer.from(auth.user.passwordHash as Uint8Array).toString()) {
    return errorResponse("Invalid current password");
  }

  // Update password
  await db
    .update(users)
    .set({
      passwordHash: Buffer.from(newMasterPasswordHash),
      akey: key,
      securityStamp: newUuid(), // invalidate all sessions
      updatedAt: new Date(),
    })
    .where(eq(users.uuid, auth.user.uuid));

  return jsonResponse({ Object: "password" });
}
