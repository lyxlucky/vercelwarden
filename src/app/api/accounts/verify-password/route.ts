import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { unauthorized, errorResponse, jsonResponse } from "@/lib/responses";

// POST /api/accounts/verify-password — used by clients to gate sensitive ops.
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

  return jsonResponse({ Object: "verify-password" });
}
