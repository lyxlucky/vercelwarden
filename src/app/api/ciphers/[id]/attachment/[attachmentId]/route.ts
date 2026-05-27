import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ciphers, attachments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { unauthorized, notFound } from "@/lib/responses";

// GET /api/ciphers/[id]/attachment/[attachmentId] — download attachment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id, attachmentId } = await params;

  // Verify cipher ownership
  const [cipher] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);

  if (!cipher) return notFound("Cipher not found");

  // Find attachment
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.uuid, attachmentId), eq(attachments.cipherUuid, id)))
    .limit(1);

  if (!attachment) return notFound("Attachment not found");

  // Proxy the file from Vercel Blob
  const response = await fetch(attachment.blobUrl);
  if (!response.ok) return notFound("File not found in storage");

  const fileBuffer = await response.arrayBuffer();

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      "Content-Length": String(attachment.fileSize),
    },
  });
}

// DELETE /api/ciphers/[id]/attachment/[attachmentId] — delete attachment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id, attachmentId } = await params;

  // Verify cipher ownership
  const [cipher] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);

  if (!cipher) return notFound("Cipher not found");

  // Delete attachment record
  await db
    .delete(attachments)
    .where(and(eq(attachments.uuid, attachmentId), eq(attachments.cipherUuid, id)));

  // Note: Vercel Blob files are not deleted (they have their own lifecycle)
  // For production, you'd want to call del() from @vercel/blob

  return new NextResponse(null, { status: 200 });
}
