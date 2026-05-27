import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { unauthorized, jsonResponse } from "@/lib/responses";

export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const body = await request.json();
  await db.update(users).set({ avatarColor: body?.avatarColor || null, updatedAt: new Date() }).where(eq(users.uuid, auth.user.uuid));
  return jsonResponse({ avatarColor: body?.avatarColor });
}
