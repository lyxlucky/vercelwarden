import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { unauthorized, errorResponse, jsonResponse } from "@/lib/responses";

// PUT /api/two-factor/disable
// Body: { masterPasswordHash, type (provider id, 0=Authenticator) }
export async function PUT(request: NextRequest) {
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

  await db
    .update(users)
    .set({ totpSecret: null, totpRecover: null, updatedAt: new Date() })
    .where(eq(users.uuid, auth.user.uuid));

  return jsonResponse({
    Enabled: false,
    Type: body?.type ?? 0,
    Object: "twoFactorProvider",
  });
}

export async function POST(request: NextRequest) {
  return PUT(request);
}
