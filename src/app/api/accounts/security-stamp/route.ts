import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, devices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { unauthorized } from "@/lib/responses";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import { apiErrorResponse } from "@/lib/server/http/errors";

// POST /api/accounts/security-stamp — rotate the user's security stamp;
// invalidates all outstanding access tokens and refresh tokens.
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  const hash = body?.masterPasswordHash ?? body?.secret;
  try {
    await authorizeAccountMutation({
      request,
      auth,
      purpose: "account.security-stamp.rotate",
      legacyMasterPasswordHash: hash,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }

  await db
    .update(users)
    .set({ securityStamp: newUuid(), updatedAt: new Date() })
    .where(eq(users.uuid, auth.user.uuid));

  // Invalidate every refresh token; future refresh attempts will fail and
  // each device will require a fresh password login.
  await db
    .update(devices)
    .set({ refreshToken: "", refreshTokenHash: null, updatedAt: new Date() })
    .where(eq(devices.userUuid, auth.user.uuid));

  return new Response(null, { status: 200 });
}
