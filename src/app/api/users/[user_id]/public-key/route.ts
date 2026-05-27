import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { unauthorized, notFound, jsonResponse } from "@/lib/responses";

export async function GET(request: NextRequest, { params }: { params: Promise<{ user_id: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { user_id } = await params;
  const [user] = await db.select().from(users).where(eq(users.uuid, user_id)).limit(1);
  if (!user) return notFound("User not found");
  return jsonResponse({ UserId: user.uuid, PublicKey: user.publicKey || "", Object: "public-key" });
}
