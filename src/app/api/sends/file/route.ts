import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { sendFiles, sends } from "@/db/schema";
import { verifyAuth, newUuid } from "@/lib/auth";
import { errorResponse, unauthorized } from "@/lib/responses";
import { serializeSend } from "@/lib/send";
import {
  cleanupExpiredPendingSendFiles,
  confirmSendFileUpload,
  hashSendPassword,
  issueSendFileUploadCredential,
  sendFileBlobPath,
  sha256SendFile,
  validateSendFileMetadata,
} from "@/lib/server/sends/service";
import {
  beginIdempotentRequest,
  completeIdempotentRequest,
  fingerprintBody,
} from "@/lib/server/idempotency/service";
import { commitUserMutation } from "@/lib/server/mutations/commit";

const noStore = { "Cache-Control": "no-store, max-age=0" };

function count(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validDate(value: unknown, required = false) {
  if (value == null || value === "") return required ? null : undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function insertFileSend(input: {
  userUuid: string;
  actingDeviceIdentifier: string;
  model: Record<string, unknown>;
  metadata: ReturnType<typeof validateSendFileMetadata>;
  sendUuid: string;
  fileUuid: string;
  status: "pending" | "complete";
  blobUrl?: string;
  uploadTokenHash?: string | null;
  uploadExpiresAt?: Date | null;
}) {
  const deletionDate = validDate(input.model.deletionDate ?? input.model.DeletionDate, true);
  const expirationDate = validDate(input.model.expirationDate ?? input.model.ExpirationDate);
  if (!deletionDate) throw new Error("deletionDate must be a valid date");
  if (expirationDate === null) throw new Error("expirationDate must be a valid date");
  if (deletionDate.getTime() <= Date.now()) throw new Error("deletionDate must be in the future");
  const now = new Date();
  const password = await hashSendPassword(
    typeof (input.model.password ?? input.model.Password) === "string"
      ? String(input.model.password ?? input.model.Password)
      : null
  );
  await commitUserMutation({
    userUuid: input.userUuid,
    resourceKind: "send",
    resourceId: input.sendUuid,
    actingDeviceIdentifier: input.actingDeviceIdentifier,
    mutate: async (tx) => {
      await tx.insert(sends).values({
        uuid: input.sendUuid,
        userUuid: input.userUuid,
        name: String(input.model.name ?? input.model.Name ?? ""),
        notes: typeof (input.model.notes ?? input.model.Notes) === "string" ? String(input.model.notes ?? input.model.Notes) : null,
        type: 1,
        data: JSON.stringify({
          id: input.fileUuid,
          fileName: input.metadata.fileName,
          size: input.metadata.plaintextSize ?? input.metadata.fileSize,
          key: input.metadata.key,
        }),
        key: String(input.model.key ?? input.model.Key ?? ""),
        password,
        maxAccessCount: count(input.model.maxAccessCount ?? input.model.MaxAccessCount),
        accessCount: 0,
        createdAt: now,
        updatedAt: now,
        expirationDate: expirationDate ?? null,
        deletionDate,
        disabled: Boolean(input.model.disabled ?? input.model.Disabled ?? false),
        hideEmail: Boolean(input.model.hideEmail ?? input.model.HideEmail ?? false),
      });
      await tx.insert(sendFiles).values({
        uuid: input.fileUuid,
        sendUuid: input.sendUuid,
        fileName: input.metadata.fileName,
        key: input.metadata.key,
        fileSize: input.metadata.fileSize,
        plaintextSize: input.metadata.plaintextSize,
        blobUrl: input.blobUrl ?? "",
        status: input.status,
        checksum: input.metadata.checksum,
        uploadTokenHash: input.uploadTokenHash ?? null,
        uploadExpiresAt: input.uploadExpiresAt ?? null,
        createdAt: now,
        completedAt: input.status === "complete" ? now : null,
      });
    },
  });
  const [created] = await db.select().from(sends).where(eq(sends.uuid, input.sendUuid)).limit(1);
  const [file] = await db.select().from(sendFiles).where(eq(sendFiles.uuid, input.fileUuid)).limit(1);
  return { created: created!, file: file! };
}

async function legacyMultipart(request: NextRequest, userUuid: string, actingDeviceIdentifier: string) {
  const formData = await request.formData();
  const file = formData.get("data") as File | null;
  const modelRaw = formData.get("model");
  if (!file || typeof modelRaw !== "string") return errorResponse("Missing file or model");
  let model: Record<string, unknown>;
  try { model = JSON.parse(modelRaw) as Record<string, unknown>; }
  catch { return errorResponse("Invalid model JSON"); }
  const fileMeta = (model.file ?? model.File ?? {}) as Record<string, unknown>;
  let metadata: ReturnType<typeof validateSendFileMetadata>;
  try {
    metadata = validateSendFileMetadata({
      fileName: model.fileName ?? model.FileName ?? fileMeta.fileName ?? fileMeta.FileName,
      fileSize: file.size,
      checksum: sha256SendFile(await file.arrayBuffer()),
      key: fileMeta.key ?? fileMeta.Key,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid Send file metadata");
  }
  const sendUuid = newUuid();
  const fileUuid = newUuid();
  const blob = await put(`sends/${userUuid}/${sendUuid}/${fileUuid}`, file, { access: "private", addRandomSuffix: false });
  try {
    const inserted = await insertFileSend({
      userUuid,
      actingDeviceIdentifier,
      model,
      metadata,
      sendUuid,
      fileUuid,
      status: "complete",
      blobUrl: blob.url,
    });
    return NextResponse.json(serializeSend(inserted.created, inserted.file), { status: 201, headers: noStore });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to create file Send");
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    return legacyMultipart(request, auth.user.uuid, auth.device.identifier);
  }
  if (!contentType.startsWith("application/json")) return errorResponse("Expected JSON metadata or multipart upload", 415);
  await cleanupExpiredPendingSendFiles();
  const model = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!model) return errorResponse("Invalid JSON body");
  const fileMeta = (model.file ?? model.File ?? {}) as Record<string, unknown>;
  let metadata: ReturnType<typeof validateSendFileMetadata>;
  try {
    metadata = validateSendFileMetadata({
      fileName: fileMeta.fileName ?? fileMeta.FileName,
      fileSize: fileMeta.size ?? fileMeta.Size,
      checksum: fileMeta.checksum ?? fileMeta.Checksum,
      key: fileMeta.key ?? fileMeta.Key,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid Send file metadata");
  }
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  const scope = `send-file-create:${auth.user.uuid}`;
  try {
    const requestHash = await fingerprintBody({ model, metadata });
    const state = await beginIdempotentRequest({ scope, key: idempotencyKey, requestHash, userUuid: auth.user.uuid });
    if (state.decision === "replay") {
      return NextResponse.json(JSON.parse(state.record.responseBody ?? "{}"), { status: state.record.responseStatus ?? 201, headers: noStore });
    }
    if (state.decision === "pending") return errorResponse("An identical Send upload is still pending", 409);
    const sendUuid = newUuid();
    const fileUuid = newUuid();
    const credential = issueSendFileUploadCredential();
    const pathname = sendFileBlobPath(auth.user.uuid, sendUuid, fileUuid);
    const inserted = await insertFileSend({
      userUuid: auth.user.uuid,
      actingDeviceIdentifier: auth.device.identifier,
      model,
      metadata,
      sendUuid,
      fileUuid,
      status: "pending",
      blobUrl: pathname,
      uploadTokenHash: credential.tokenHash,
      uploadExpiresAt: credential.expiresAt,
    });
    const responseBody = {
      object: "sendFileUpload",
      send: serializeSend(inserted.created, inserted.file),
      sendId: sendUuid,
      fileId: fileUuid,
      pathname,
      uploadToken: credential.token,
      expiresAt: credential.expiresAt.toISOString(),
    };
    await completeIdempotentRequest(scope, idempotencyKey, { status: 201, body: responseBody });
    return NextResponse.json(responseBody, { status: 201, headers: noStore });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to create file Send", 400);
  }
}

// PUT /api/sends/file — confirm a client-direct-to-Blob upload has finished.
// The bytes went straight to Blob storage (bypassing the ~4.5MB function body
// limit); this call verifies the blob via head() and flips the row to complete.
// Idempotent and safe to race with the onUploadCompleted webhook.
export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const body = (await request.json().catch(() => null)) as { sendId?: string; fileId?: string } | null;
  const sendId = body?.sendId;
  const fileId = body?.fileId;
  if (!sendId || !fileId) return errorResponse("sendId and fileId are required");
  const result = await confirmSendFileUpload({
    userUuid: auth.user.uuid,
    sendUuid: sendId,
    fileUuid: fileId,
    actingDeviceIdentifier: auth.device.identifier,
  });
  if (!result.ok) return errorResponse(result.message, result.status);
  return NextResponse.json({
    object: "sendFile",
    send: serializeSend(result.send, result.file),
    sendId,
    fileId,
    status: "complete",
  }, { headers: noStore });
}
