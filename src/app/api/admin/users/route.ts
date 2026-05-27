import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonResponse, unauthorized } from "@/lib/responses";

function checkAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [, password] = decoded.split(":");
  return password === process.env.ADMIN_PASSWORD;
}

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
