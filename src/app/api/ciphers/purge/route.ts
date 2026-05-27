import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { unauthorized, errorResponse } from "@/lib/responses";

// POST /api/ciphers/purge — permanently delete every cipher the user owns
// (including soft-deleted ones).
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  const hash = body?.masterPasswordHash ?? body?.secret;
  if (!hash) return errorResponse("Missing masterPasswordHash");

  const ok = verifyPassword(
    hash,
    auth.user.passwordHash as Uint8Array,
    auth.user.salt as Uint8Array,
    auth.user.passwordIterations
  );
  if (!ok) return errorResponse("Invalid password");

  await db
    .delete(ciphers)
    .where(and(eq(ciphers.userUuid, auth.user.uuid), isNull(ciphers.organizationUuid)));

  return new Response(null, { status: 200 });
}
