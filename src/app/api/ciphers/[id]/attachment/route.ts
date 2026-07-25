import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { put, del } from "@vercel/blob";
import { db } from "@/db";
import { attachments, ciphers, folderCiphers } from "@/db/schema";
import { verifyAuth, newUuid } from "@/lib/auth";
import { errorResponse, jsonResponse, notFound, unauthorized } from "@/lib/responses";
import { serializeCipher } from "@/lib/cipher";
import {
  DEFAULT_ATTACHMENT_LIMIT_BYTES,
  issueUploadCredential,
  sha256Hex,
  validateAttachmentMetadata,
  verifyUploadCredential,
} from "@/lib/server/attachments/service";

async function ownedCipher(userUuid: string, id: string) {
  const [cipher] = await db.select().from(ciphers).where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, userUuid))).limit(1);
  return cipher ?? null;
}

async function cleanupExpiredPending() {
  const expired = await db.select().from(attachments).where(and(eq(attachments.status, "pending"), lt(attachments.uploadExpiresAt, new Date())));
  for (const attachment of expired) {
    if (attachment.blobUrl) await del(attachment.blobUrl).catch(() => undefined);
    await db.delete(attachments).where(eq(attachments.uuid, attachment.uuid));
  }
}

async function legacyUpload(request: NextRequest, userUuid: string, id: string) {
  const formData = await request.formData();
  const file = formData.get("data") as File | null;
  const fileName = formData.get("fileName") as string | null;
  const key = (formData.get("key") as string | null) ?? null;
  if (!file || !fileName) return errorResponse("Missing file or fileName");
  if (file.size > DEFAULT_ATTACHMENT_LIMIT_BYTES) return errorResponse("Attachment exceeds the configured size limit", 413);

  const attachmentId = newUuid();
  const blobPath = `attachments/${userUuid}/${id}/${attachmentId}`;
  const blob = await put(blobPath, file, { access: "public", addRandomSuffix: false });
  const now = new Date();
  await db.insert(attachments).values({
    uuid: attachmentId,
    cipherUuid: id,
    createdAt: now,
    fileName,
    fileSize: file.size,
    key,
    blobUrl: blob.url,
    status: "complete",
    checksum: sha256Hex(await file.arrayBuffer()),
    completedAt: now,
  });
  await db.update(ciphers).set({ updatedAt: now }).where(eq(ciphers.uuid, id));
  const [link] = await db.select().from(folderCiphers).where(eq(folderCiphers.cipherUuid, id)).limit(1);
  const [updated] = await db.select().from(ciphers).where(eq(ciphers.uuid, id)).limit(1);
  const cipherAttachments = await db.select().from(attachments).where(and(eq(attachments.cipherUuid, id), eq(attachments.status, "complete")));
  return jsonResponse(serializeCipher(updated!, { folderId: link?.folderUuid ?? null, attachments: cipherAttachments, origin: request.nextUrl.origin }));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { id } = await params;
  if (!await ownedCipher(auth.user.uuid, id)) return notFound("Cipher not found");
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("multipart/form-data")) return legacyUpload(request, auth.user.uuid, id);
  if (!contentType.startsWith("application/json")) return errorResponse("Expected JSON metadata or multipart upload", 415);

  await cleanupExpiredPending();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return errorResponse("Invalid JSON body");
  let metadata: ReturnType<typeof validateAttachmentMetadata>;
  try {
    metadata = validateAttachmentMetadata({ fileName: body.fileName, fileSize: body.fileSize, checksum: body.checksum });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid attachment metadata");
  }
  const attachmentId = newUuid();
  const credential = issueUploadCredential();
  await db.insert(attachments).values({
    uuid: attachmentId,
    cipherUuid: id,
    createdAt: new Date(),
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    key: typeof body.key === "string" ? body.key : null,
    blobUrl: "",
    status: "pending",
    checksum: metadata.checksum,
    uploadTokenHash: credential.tokenHash,
    uploadExpiresAt: credential.expiresAt,
  });
  return NextResponse.json({
    object: "attachmentUpload",
    id: attachmentId,
    uploadUrl: `/api/ciphers/${encodeURIComponent(id)}/attachment`,
    uploadToken: credential.token,
    expiresAt: credential.expiresAt.toISOString(),
  }, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { id } = await params;
  if (!await ownedCipher(auth.user.uuid, id)) return notFound("Cipher not found");
  const attachmentId = request.headers.get("x-attachment-id");
  const token = request.headers.get("x-upload-token") ?? "";
  if (!attachmentId || !token) return errorResponse("Missing attachment upload credentials", 401);
  const [attachment] = await db.select().from(attachments).where(and(eq(attachments.uuid, attachmentId), eq(attachments.cipherUuid, id))).limit(1);
  if (!attachment || attachment.status !== "pending") return notFound("Pending attachment not found");
  if (!verifyUploadCredential(token, attachment.uploadTokenHash, attachment.uploadExpiresAt)) return errorResponse("Attachment upload token is invalid or expired", 401);
  const payload = await request.arrayBuffer();
  if (payload.byteLength !== attachment.fileSize) return errorResponse("Attachment upload size does not match metadata", 400);
  const checksum = sha256Hex(payload);
  if (attachment.checksum && attachment.checksum !== checksum) return errorResponse("Attachment checksum mismatch", 400);
  const blobPath = `attachments/${auth.user.uuid}/${id}/${attachmentId}`;
  const blob = await put(blobPath, new Blob([payload]), { access: "public", addRandomSuffix: false });
  const now = new Date();
  await db.update(attachments).set({
    blobUrl: blob.url,
    status: "complete",
    checksum,
    uploadTokenHash: null,
    uploadExpiresAt: null,
    completedAt: now,
  }).where(eq(attachments.uuid, attachmentId));
  await db.update(ciphers).set({ updatedAt: now }).where(eq(ciphers.uuid, id));
  return NextResponse.json({ object: "attachment", id: attachmentId, status: "complete", checksum }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
