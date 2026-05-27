import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, attachments, folderCiphers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { put } from "@vercel/blob";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound, errorResponse } from "@/lib/responses";
import { serializeCipher } from "@/lib/cipher";

// POST /api/ciphers/[id]/attachment — upload attachment (legacy single-step).
// Vaultwarden returns the full cipher JSON (ciphers.rs:1382).
export async function POST(
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

  const formData = await request.formData();
  const file = formData.get("data") as File | null;
  const fileName = formData.get("fileName") as string | null;
  const key = (formData.get("key") as string | null) ?? null;
  if (!file || !fileName) return errorResponse("Missing file or fileName");

  const attachmentId = newUuid();
  const blobPath = `attachments/${auth.user.uuid}/${id}/${attachmentId}`;
  const blob = await put(blobPath, file, {
    access: "public",
    addRandomSuffix: false,
  });

  await db.insert(attachments).values({
    uuid: attachmentId,
    cipherUuid: id,
    createdAt: new Date(),
    fileName,
    fileSize: file.size,
    key,
    blobUrl: blob.url,
  });

  await db
    .update(ciphers)
    .set({ updatedAt: new Date() })
    .where(eq(ciphers.uuid, id));

  const [link] = await db
    .select()
    .from(folderCiphers)
    .where(eq(folderCiphers.cipherUuid, id))
    .limit(1);
  const [updated] = await db.select().from(ciphers).where(eq(ciphers.uuid, id)).limit(1);
  const cipherAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.cipherUuid, id));
  return jsonResponse(
    serializeCipher(updated!, {
      folderId: link?.folderUuid ?? null,
      attachments: cipherAttachments,
      origin: request.nextUrl.origin,
    })
  );
}
