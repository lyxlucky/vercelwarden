import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, devices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { unauthorized, errorResponse } from "@/lib/responses";

// POST /api/accounts/security-stamp — rotate the user's security stamp;
// invalidates all outstanding access tokens and refresh tokens.
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
    .update(users)
    .set({ securityStamp: newUuid(), updatedAt: new Date() })
    .where(eq(users.uuid, auth.user.uuid));

  // Invalidate every refresh token; future refresh attempts will fail and
  // each device will require a fresh password login.
  await db
    .update(devices)
    .set({ refreshToken: "", updatedAt: new Date() })
    .where(eq(devices.userUuid, auth.user.uuid));

  return new Response(null, { status: 200 });
}
