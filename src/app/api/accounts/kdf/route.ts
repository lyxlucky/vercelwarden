import { NextRequest } from "next/server";
import { db } from "@/db";
import { devices, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import {
  hashPassword,
  newSalt,
} from "@/lib/password";
import { unauthorized, errorResponse } from "@/lib/responses";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import { apiErrorResponse } from "@/lib/server/http/errors";
import { recordAuditEvent } from "@/lib/server/audit/events";

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

  if (!newMasterPasswordHash || kdfType === undefined || !key) {
    return errorResponse("Missing required fields");
  }
  try {
    await authorizeAccountMutation({
      request,
      auth,
      purpose: "account.kdf.change",
      legacyMasterPasswordHash: masterPasswordHash,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }

  const salt = newSalt();
  const passwordHash = hashPassword(newMasterPasswordHash, salt);

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      clientKdfType: kdfType,
      clientKdfIter: kdfIterations ?? 600000,
      clientKdfMemory: kdfMemory ?? null,
      clientKdfParallelism: kdfParallelism ?? null,
      akey: key,
      passwordHash,
      salt,
      securityStamp: newUuid(),
      updatedAt: new Date(),
    }).where(eq(users.uuid, auth.user.uuid));
    await tx.update(devices).set({ refreshToken: "", refreshTokenHash: null, updatedAt: new Date() })
      .where(eq(devices.userUuid, auth.user.uuid));
  });

  await recordAuditEvent({
    action: "account.kdf.change",
    actorUserUuid: auth.user.uuid,
    actorEmailSnapshot: auth.user.email,
    targetId: auth.user.uuid,
    outcome: "succeeded",
    request,
    metadata: { kdfType, iterations: kdfIterations ?? 600000 },
  });

  return new Response(null, { status: 200 });
}
