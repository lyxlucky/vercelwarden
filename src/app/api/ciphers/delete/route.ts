import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { unauthorized, errorResponse } from "@/lib/responses";

// PUT /api/ciphers/delete — bulk soft-delete (move-to-trash).
// Body: { ids: string[] }
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length === 0) return errorResponse("ids is required");

  const now = new Date();
  await db
    .update(ciphers)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(inArray(ciphers.uuid, ids), eq(ciphers.userUuid, auth.user.uuid)));

  return new Response(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  return PUT(request);
}

export async function DELETE(request: NextRequest) {
  return PUT(request);
}
