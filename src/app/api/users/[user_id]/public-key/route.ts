import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { unauthorized, notFound, jsonResponse } from "@/lib/responses";

// GET /api/users/{userId}/public-key — Vaultwarden accounts.rs:471.
// Response: { userId, publicKey, object: "userKey" }. 404 if no public_key.
export async function GET(request: NextRequest, { params }: { params: Promise<{ user_id: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { user_id } = await params;
  const [user] = await db.select().from(users).where(eq(users.uuid, user_id)).limit(1);
  if (!user) return notFound("User doesn't exist");
  if (!user.publicKey) return notFound("User has no public_key");
  return jsonResponse({ userId: user.uuid, publicKey: user.publicKey, object: "userKey" });
}
