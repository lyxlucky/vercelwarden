import { NextRequest } from "next/server";
import { db } from "@/db";
import { invitationCodes } from "@/db/schema";
import { isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { jsonResponse, unauthorized } from "@/lib/responses";

function checkAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [, password] = decoded.split(":");
  return password === process.env.ADMIN_PASSWORD;
}

// GET /api/admin/invitations — list all invitation codes
export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) return unauthorized("Invalid admin password");

  const codes = await db.select().from(invitationCodes);
  return jsonResponse({
    data: codes.map((c) => ({
      code: c.code,
      createdAt: c.createdAt.toISOString(),
      usedAt: c.usedAt?.toISOString() || null,
      usedBy: c.usedBy,
      createdBy: c.createdBy,
    })),
    object: "list",
  });
}

// POST /api/admin/invitations — create a new invitation code
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) return unauthorized("Invalid admin password");

  const body = await request.json().catch(() => ({}));
  const code = body.code || uuidv4().slice(0, 8).toUpperCase();

  await db.insert(invitationCodes).values({
    code,
    createdAt: new Date(),
    createdBy: "admin",
  });

  return jsonResponse({ code, object: "invitation" }, 201);
}

// DELETE /api/admin/invitations — delete an invitation code
export async function DELETE(request: NextRequest) {
  if (!checkAdminAuth(request)) return unauthorized("Invalid admin password");

  const body = await request.json();
  const code = body.code;
  if (!code) return unauthorized("Missing code");

  const { eq } = await import("drizzle-orm");
  await db.delete(invitationCodes).where(eq(invitationCodes.code, code));
  return jsonResponse({ Object: "invitation" });
}
