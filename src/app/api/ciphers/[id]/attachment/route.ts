import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, attachments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { put } from "@vercel/blob";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound, errorResponse } from "@/lib/responses";

// POST /api/ciphers/[id]/attachment — upload attachment
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;

  // Verify cipher ownership
  const [cipher] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);

  if (!cipher) return notFound("Cipher not found");

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get("data") as File | null;
  const fileName = formData.get("fileName") as string;

  if (!file || !fileName) {
    return errorResponse("Missing file or fileName");
  }

  // Upload to Vercel Blob
  const attachmentId = newUuid();
  const blobPath = `attachments/${auth.user.uuid}/${id}/${attachmentId}`;

  const blob = await put(blobPath, file, {
    access: "public",
    addRandomSuffix: false,
  });

  // Store attachment metadata in DB
  await db.insert(attachments).values({
    uuid: attachmentId,
    cipherUuid: id,
    createdAt: new Date(),
    fileName, // encrypted by client
    fileSize: file.size,
    blobUrl: blob.url,
  });

  // Return attachment metadata (Vaultwarden format)
  return jsonResponse({
    Id: attachmentId,
    FileName: fileName,
    Size: file.size,
    SizeName: null,
    Url: `/api/ciphers/${id}/attachment/${attachmentId}`,
    Object: "attachment",
  });
}
