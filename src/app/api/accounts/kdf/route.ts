import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import {
  hashPassword,
  newSalt,
  verifyPassword,
} from "@/lib/password";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";

// POST /api/accounts/kdf — change client-side KDF settings.
// Changing KDF reissues both `key` (encrypted with new master key) and
// `newMasterPasswordHash` (KDF output of new master key).
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json();
  const masterPasswordHash = body?.masterPasswordHash;
  const newMasterPasswordHash = body?.newMasterPasswordHash ?? masterPasswordHash;
  const kdfType = body?.kdf;
  const kdfIterations = body?.kdfIterations;
  const kdfMemory = body?.kdfMemory;
  const kdfParallelism = body?.kdfParallelism;
  const key = body?.key;

  if (!masterPasswordHash || kdfType === undefined || !key) {
    return errorResponse("Missing required fields");
  }

  const ok = verifyPassword(
    masterPasswordHash,
    auth.user.passwordHash as Uint8Array,
    auth.user.salt as Uint8Array,
    auth.user.passwordIterations
  );
  if (!ok) return errorResponse("Invalid password");

  const salt = newSalt();
  const passwordHash = hashPassword(newMasterPasswordHash, salt);

  await db
    .update(users)
    .set({
      clientKdfType: kdfType,
      clientKdfIter: kdfIterations ?? 600000,
      clientKdfMemory: kdfMemory ?? null,
      clientKdfParallelism: kdfParallelism ?? null,
      akey: key,
      passwordHash,
      salt,
      securityStamp: newUuid(),
      updatedAt: new Date(),
    })
    .where(eq(users.uuid, auth.user.uuid));

  return jsonResponse({ Object: "kdf" });
}
