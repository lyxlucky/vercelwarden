import { NextRequest } from "next/server";
import { db } from "@/db";
import { sends } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound } from "@/lib/responses";

// PUT /api/sends/[id]/remove-password — strip the access password from a send.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const [send] = await db
    .select()
    .from(sends)
    .where(eq(sends.uuid, id))
    .limit(1);
  if (!send || send.userUuid !== auth.user.uuid) return notFound("Send not found");

  await db
    .update(sends)
    .set({ password: null, updatedAt: new Date() })
    .where(eq(sends.uuid, id));

  return jsonResponse({ Object: "send", Id: id });
}
