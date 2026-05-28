import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";
import { checkAdminAuth } from "@/lib/admin";

// GET /api/admin/users — list all registered users
export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) return unauthorized("Invalid admin password");

  const allUsers = await db.select().from(users);

  return jsonResponse({
    data: allUsers.map((u) => ({
      uuid: u.uuid,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      enabled: u.enabled,
      emailVerified: !!u.verifiedAt,
      twoFactorEnabled: !!u.totpSecret,
      kdfType: u.clientKdfType,
    })),
    object: "list",
  });
}

// PATCH /api/admin/users — toggle enabled status for a user
export async function PATCH(request: NextRequest) {
  if (!checkAdminAuth(request)) return unauthorized("Invalid admin password");

  const body = await request.json().catch(() => null);
  const uuid: string | undefined = body?.uuid;
  const enabled: boolean | undefined = body?.enabled;

  if (!uuid || typeof enabled !== "boolean") {
    return errorResponse("Missing uuid or enabled flag");
  }

  await db
    .update(users)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(users.uuid, uuid));

  return jsonResponse({ uuid, enabled, object: "user" });
}

// DELETE /api/admin/users — delete a user by uuid
export async function DELETE(request: NextRequest) {
  if (!checkAdminAuth(request)) return unauthorized("Invalid admin password");

  const body = await request.json().catch(() => null);
  const uuid: string | undefined = body?.uuid;
  if (!uuid) return errorResponse("Missing uuid");

  await db.delete(users).where(eq(users.uuid, uuid));
  return jsonResponse({ uuid, object: "user" });
}
