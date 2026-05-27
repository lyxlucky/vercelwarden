import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folderCiphers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound } from "@/lib/responses";
import { extractCipherData, serializeCipher } from "@/lib/cipher";

async function getFolderId(cipherId: string): Promise<string | null> {
  const [link] = await db
    .select()
    .from(folderCiphers)
    .where(eq(folderCiphers.cipherUuid, cipherId))
    .limit(1);
  return link?.folderUuid ?? null;
}

// GET /api/ciphers/[id]
export async function GET(
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
  return jsonResponse(serializeCipher(cipher, { folderId: await getFolderId(id) }));
}

// PUT /api/ciphers/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const [existing] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);
  if (!existing) return notFound("Cipher not found");

  const hasNewTypeData = body.Login || body.SecureNote || body.Card || body.Identity || body.SshKey;
  const now = new Date();

  await db
    .update(ciphers)
    .set({
      name: body.Name ?? existing.name,
      notes: body.Notes ?? existing.notes,
      fields: body.Fields ? JSON.stringify(body.Fields) : existing.fields,
      data: hasNewTypeData ? JSON.stringify(extractCipherData(body)) : existing.data,
      key: body.Key ?? existing.key,
      passwordHistory: body.PasswordHistory
        ? JSON.stringify(body.PasswordHistory)
        : existing.passwordHistory,
      favorite: body.Favorite ?? existing.favorite,
      edit: body.Edit ?? existing.edit,
      reprompt: body.Reprompt ?? existing.reprompt,
      updatedAt: now,
    })
    .where(eq(ciphers.uuid, id));

  if (body.FolderId !== undefined) {
    await db.delete(folderCiphers).where(eq(folderCiphers.cipherUuid, id));
    if (body.FolderId) {
      await db.insert(folderCiphers).values({ folderUuid: body.FolderId, cipherUuid: id });
    }
  }

  const [updated] = await db.select().from(ciphers).where(eq(ciphers.uuid, id)).limit(1);
  return jsonResponse(
    serializeCipher(updated!, { folderId: await getFolderId(id) })
  );
}

// DELETE /api/ciphers/[id] — soft delete (move to trash)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);
  if (!existing) return notFound("Cipher not found");

  await db
    .update(ciphers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(ciphers.uuid, id));

  return jsonResponse({ Object: "cipher" });
}
