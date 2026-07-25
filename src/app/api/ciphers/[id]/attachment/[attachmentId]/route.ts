import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { attachments, ciphers } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { errorResponse, notFound, unauthorized } from "@/lib/responses";
import { issueDownloadToken, verifyDownloadToken } from "@/lib/server/attachments/service";

async function ownedAttachment(userUuid: string, cipherUuid: string, attachmentUuid: string) {
  const [cipher] = await db.select().from(ciphers).where(and(eq(ciphers.uuid, cipherUuid), eq(ciphers.userUuid, userUuid))).limit(1);
  if (!cipher) return null;
  const [attachment] = await db.select().from(attachments).where(and(eq(attachments.uuid, attachmentUuid), eq(attachments.cipherUuid, cipherUuid))).limit(1);
  return attachment?.status === "complete" ? attachment : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params;
  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    const claims = verifyDownloadToken(token);
    if (!claims || claims.cipherUuid !== id || claims.attachmentUuid !== attachmentId) return errorResponse("Attachment download token is invalid or expired", 401);
    const attachment = await ownedAttachment(claims.userUuid, id, attachmentId);
    return attachment ? NextResponse.redirect(attachment.blobUrl, { status: 302 }) : notFound("Attachment not found");
  }

  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const attachment = await ownedAttachment(auth.user.uuid, id, attachmentId);
  if (!attachment) return notFound("Attachment not found");
  if (request.nextUrl.searchParams.get("metadata") === "true") {
    const credential = issueDownloadToken({ userUuid: auth.user.uuid, cipherUuid: id, attachmentUuid: attachmentId });
    return NextResponse.json({
      object: "attachmentDownload",
      id: attachmentId,
      downloadUrl: `${request.nextUrl.origin}/api/ciphers/${encodeURIComponent(id)}/attachment/${encodeURIComponent(attachmentId)}?token=${encodeURIComponent(credential.token)}`,
      expiresAt: credential.expiresAt.toISOString(),
      checksum: attachment.checksum,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }
  return NextResponse.redirect(attachment.blobUrl, { status: 302 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { id, attachmentId } = await params;
  const attachment = await ownedAttachment(auth.user.uuid, id, attachmentId);
  if (!attachment) return notFound("Attachment not found");
  if (attachment.blobUrl) await del(attachment.blobUrl).catch(() => undefined);
  await db.delete(attachments).where(and(eq(attachments.uuid, attachmentId), eq(attachments.cipherUuid, id)));
  await db.update(ciphers).set({ updatedAt: new Date() }).where(eq(ciphers.uuid, id));
  return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
}
