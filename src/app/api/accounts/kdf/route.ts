import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";

// POST /api/accounts/kdf — change KDF settings
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json();
  const masterPasswordHash = body?.masterPasswordHash;
  const kdfType = body?.kdf;
  const kdfIterations = body?.kdfIterations;
  const kdfMemory = body?.kdfMemory;
  const kdfParallelism = body?.kdfParallelism;
  const key = body?.key;

  if (!masterPasswordHash || kdfType === undefined || !key) {
    return errorResponse("Missing required fields");
  }

  // Verify password
  if (masterPasswordHash !== Buffer.from(auth.user.passwordHash as Uint8Array).toString()) {
    return errorResponse("Invalid password");
  }

  await db
    .update(users)
    .set({
      clientKdfType: kdfType,
      clientKdfIter: kdfIterations ?? 600000,
      clientKdfMemory: kdfMemory ?? null,
      clientKdfParallelism: kdfParallelism ?? null,
      akey: key,
      updatedAt: new Date(),
    })
    .where(eq(users.uuid, auth.user.uuid));

  return jsonResponse({ Object: "kdf" });
}
