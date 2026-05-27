import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { unauthorized, errorResponse } from "@/lib/responses";

// POST /api/accounts/delete — permanently delete the current user's account.
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  const hash = body?.masterPasswordHash;
  if (!hash) return errorResponse("Missing masterPasswordHash");

  const ok = verifyPassword(
    hash,
    auth.user.passwordHash as Uint8Array,
    auth.user.salt as Uint8Array,
    auth.user.passwordIterations
  );
  if (!ok) return errorResponse("Invalid password");

  await db.delete(users).where(eq(users.uuid, auth.user.uuid));
  return new Response(null, { status: 200 });
}

// DELETE /api/accounts — alias for legacy clients
export async function DELETE(request: NextRequest) {
  return POST(request);
}
