import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ciphers, attachments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { del } from "@vercel/blob";
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
  const [cipher] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);
  if (!cipher) return notFound("Cipher not found");

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.uuid, attachmentId), eq(attachments.cipherUuid, id)))
    .limit(1);
  if (!attachment) return notFound("Attachment not found");

  // Vercel Blob URLs are public; redirect rather than proxy to save bandwidth.
  return NextResponse.redirect(attachment.blobUrl, { status: 302 });
}

// DELETE /api/ciphers/[id]/attachment/[attachmentId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id, attachmentId } = await params;
  const [cipher] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)))
    .limit(1);
  if (!cipher) return notFound("Cipher not found");

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.uuid, attachmentId), eq(attachments.cipherUuid, id)))
    .limit(1);
  if (!attachment) return notFound("Attachment not found");

  try {
    await del(attachment.blobUrl);
  } catch {
    // best-effort
  }

  await db
    .delete(attachments)
    .where(and(eq(attachments.uuid, attachmentId), eq(attachments.cipherUuid, id)));

  await db
    .update(ciphers)
    .set({ updatedAt: new Date() })
    .where(eq(ciphers.uuid, id));

  return new NextResponse(null, { status: 200 });
}
