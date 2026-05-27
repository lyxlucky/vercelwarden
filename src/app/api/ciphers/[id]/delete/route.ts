import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folderCiphers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound } from "@/lib/responses";
import { serializeCipher } from "@/lib/cipher";

// PUT /api/ciphers/[id]/delete — soft-delete equivalent of DELETE /[id].
// Newer clients prefer the explicit verb.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const [cipher] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);
  if (!cipher) return notFound("Cipher not found");

  const now = new Date();
  await db
    .update(ciphers)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(ciphers.uuid, id));

  const [link] = await db
    .select()
    .from(folderCiphers)
    .where(eq(folderCiphers.cipherUuid, id))
    .limit(1);
  const [updated] = await db.select().from(ciphers).where(eq(ciphers.uuid, id)).limit(1);
  return jsonResponse(
    serializeCipher(updated!, { folderId: link?.folderUuid ?? null })
  );
}
