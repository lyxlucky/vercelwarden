import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";

// POST /api/accounts/keys — upload RSA key pair (public + encrypted private)
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json();
  const publicKey = body?.publicKey;
  const privateKey = body?.encryptedPrivateKey;

  if (!publicKey || !privateKey) {
    return errorResponse("Missing publicKey or encryptedPrivateKey");
  }

  await db
    .update(users)
    .set({ publicKey, privateKey, updatedAt: new Date() })
    .where(eq(users.uuid, auth.user.uuid));

  return jsonResponse({ Object: "keys" });
}
