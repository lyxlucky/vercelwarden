import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folderCiphers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound, errorResponse } from "@/lib/responses";
import { extractCipherData, serializeCipher } from "@/lib/cipher";

async function getFolderId(cipherId: string): Promise<string | null> {
  const [link] = await db
    .select()
    .from(folderCiphers)
    .where(eq(folderCiphers.cipherUuid, cipherId))
    .limit(1);
  return link?.folderUuid ?? null;
}

function pick<T = unknown>(body: Record<string, unknown>, camel: string, pascal: string, fallback?: T): T {
  const v = body[camel] ?? body[pascal];
  return (v as T) ?? (fallback as T);
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
  const raw = await request.json().catch(() => null);
  if (!raw) return errorResponse("Invalid JSON body");
  const body = raw as Record<string, unknown>;

  const [existing] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);
  if (!existing) return notFound("Cipher not found");

  const hasNewTypeData =
    body.login || body.Login ||
    body.secureNote || body.SecureNote ||
    body.card || body.Card ||
    body.identity || body.Identity ||
    body.sshKey || body.SshKey;
  const now = new Date();

  await db
    .update(ciphers)
    .set({
      name: pick<string>(body, "name", "Name", existing.name),
      notes: pick<string | null>(body, "notes", "Notes", existing.notes),
      fields:
        body.fields || body.Fields
          ? JSON.stringify(body.fields ?? body.Fields)
          : existing.fields,
      data: hasNewTypeData ? JSON.stringify(extractCipherData(body)) : existing.data,
      key: pick<string | null>(body, "key", "Key", existing.key),
      passwordHistory:
        body.passwordHistory || body.PasswordHistory
          ? JSON.stringify(body.passwordHistory ?? body.PasswordHistory)
          : existing.passwordHistory,
      favorite: pick<boolean>(body, "favorite", "Favorite", existing.favorite),
      edit: pick<boolean>(body, "edit", "Edit", existing.edit),
      reprompt: pick<number>(body, "reprompt", "Reprompt", existing.reprompt),
      updatedAt: now,
    })
    .where(eq(ciphers.uuid, id));

  // FolderId update — touch the link table when the body carries the field.
  if (body.folderId !== undefined || body.FolderId !== undefined) {
    const folderId = pick<string | null>(body, "folderId", "FolderId", null);
    await db.delete(folderCiphers).where(eq(folderCiphers.cipherUuid, id));
    if (folderId) {
      await db.insert(folderCiphers).values({ folderUuid: folderId, cipherUuid: id });
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

  return jsonResponse({ object: "cipher" });
}
