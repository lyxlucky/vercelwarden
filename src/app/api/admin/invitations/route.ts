import { NextRequest } from "next/server";
import { db } from "@/db";
import { invitationCodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";
import { checkAdminAuth } from "@/lib/admin";

// GET /api/admin/invitations — list all invitation codes
export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) return unauthorized("Invalid admin password");

  const codes = await db.select().from(invitationCodes);
  return jsonResponse({
    data: codes.map((c) => ({
      code: c.code,
      createdAt: c.createdAt.toISOString(),
      usedAt: c.usedAt?.toISOString() ?? null,
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

  const body = await request.json().catch(() => null);
  const code = body?.code;
  if (!code) return errorResponse("Missing code");

  await db.delete(invitationCodes).where(eq(invitationCodes.code, code));
  return jsonResponse({ Object: "invitation" });
}
