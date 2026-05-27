import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, attachments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { put } from "@vercel/blob";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound, errorResponse } from "@/lib/responses";

// POST /api/ciphers/[id]/attachment — upload attachment (legacy single-step).
// New clients use the v2 flow; we mirror the legacy response shape here.
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

  return jsonResponse({
    Id: attachmentId,
    FileName: fileName,
    Size: file.size,
    SizeName: null,
    Url: `${request.nextUrl.origin}/api/ciphers/${id}/attachment/${attachmentId}`,
    Key: key,
    Object: "attachment",
  });
}
