import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folderCiphers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";

// POST /api/ciphers/move
// Body: { ids: string[], folderId: string | null }
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  const folderId: string | null = body?.folderId ?? null;
  if (ids.length === 0) return errorResponse("ids is required");

  // Confirm every cipher belongs to the user.
  const owned = await db
    .select({ uuid: ciphers.uuid })
    .from(ciphers)
    .where(and(inArray(ciphers.uuid, ids), eq(ciphers.userUuid, auth.user.uuid)));
  const ownedIds = owned.map((c) => c.uuid);
  if (ownedIds.length === 0) return jsonResponse({ Object: "move" });

  await db.delete(folderCiphers).where(inArray(folderCiphers.cipherUuid, ownedIds));
  if (folderId) {
    await db
      .insert(folderCiphers)
      .values(ownedIds.map((cipherUuid) => ({ folderUuid: folderId, cipherUuid })));
  }

  const now = new Date();
  await db
    .update(ciphers)
    .set({ updatedAt: now })
    .where(inArray(ciphers.uuid, ownedIds));

  return jsonResponse({ Object: "move" });
}
