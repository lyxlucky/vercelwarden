import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonResponse, unauthorized } from "@/lib/responses";
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
