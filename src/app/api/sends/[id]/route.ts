import { NextRequest } from "next/server";
import { db } from "@/db";
import { sendFiles, sends } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound, errorResponse } from "@/lib/responses";
import { serializeSend } from "@/lib/send";
import { deleteSendBlobs, hashSendPassword } from "@/lib/server/sends/service";

// GET /api/sends/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const [send] = await db
    .select()
    .from(sends)
    .where(and(eq(sends.uuid, id), eq(sends.userUuid, auth.user.uuid)))
    .limit(1);
  if (!send) return notFound("Send not found");
  const [file] = send.type === 1
    ? await db.select().from(sendFiles).where(eq(sendFiles.sendUuid, send.uuid)).limit(1)
    : [];
  return jsonResponse(serializeSend(send, file));
}

// PUT /api/sends/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(sends)
    .where(and(eq(sends.uuid, id), eq(sends.userUuid, auth.user.uuid)))
    .limit(1);
  if (!existing) return notFound("Send not found");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorResponse("Invalid JSON body");

  const dataField =
    existing.type === 0
      ? body.text ?? body.Text
      : body.file ?? body.File;

  const passwordProvided =
    body.password !== undefined ||
    body.Password !== undefined;
  const nameProvided = body.name !== undefined || body.Name !== undefined;
  const notesProvided = body.notes !== undefined || body.Notes !== undefined;
  const expirationProvided = body.expirationDate !== undefined || body.ExpirationDate !== undefined;
  const deletionProvided = body.deletionDate !== undefined || body.DeletionDate !== undefined;
  const disabledProvided = body.disabled !== undefined || body.Disabled !== undefined;
  const hideEmailProvided = body.hideEmail !== undefined || body.HideEmail !== undefined;

  const maxAccessProvided =
    body.maxAccessCount !== undefined ||
    body.MaxAccessCount !== undefined;
  const maxAccessRaw = body.maxAccessCount ?? body.MaxAccessCount;
  const maxAccess = typeof maxAccessRaw === "number"
    ? maxAccessRaw
    : typeof maxAccessRaw === "string"
      ? parseInt(maxAccessRaw)
      : null;

  await db
    .update(sends)
    .set({
      name: nameProvided ? String(body.name ?? body.Name ?? "") : existing.name,
      notes: notesProvided ? (typeof (body.notes ?? body.Notes) === "string" ? String(body.notes ?? body.Notes) : null) : existing.notes,
      data: dataField ? JSON.stringify(dataField) : existing.data,
      key: ((body.key ?? body.Key) as string) ?? existing.key,
      password: passwordProvided
        ? await hashSendPassword(((body.password ?? body.Password) as string | null) ?? null)
        : existing.password,
      maxAccessCount: maxAccessProvided ? maxAccess : existing.maxAccessCount,
      expirationDate: expirationProvided
        ? body.expirationDate ?? body.ExpirationDate
          ? new Date((body.expirationDate ?? body.ExpirationDate) as string)
          : null
        : existing.expirationDate,
      deletionDate: deletionProvided
        ? new Date((body.deletionDate ?? body.DeletionDate) as string)
        : existing.deletionDate,
      disabled: disabledProvided ? Boolean(body.disabled ?? body.Disabled) : existing.disabled,
      hideEmail: hideEmailProvided ? Boolean(body.hideEmail ?? body.HideEmail) : existing.hideEmail,
      updatedAt: new Date(),
    })
    .where(eq(sends.uuid, id));

  if (existing.type === 1 && dataField && typeof dataField === "object") {
    const fileData = dataField as Record<string, unknown>;
    await db.update(sendFiles).set({
      fileName: typeof (fileData.fileName ?? fileData.FileName) === "string"
        ? String(fileData.fileName ?? fileData.FileName)
        : undefined,
      key: typeof (fileData.key ?? fileData.Key) === "string"
        ? String(fileData.key ?? fileData.Key)
        : undefined,
    }).where(eq(sendFiles.sendUuid, id));
  }

  const [updated] = await db.select().from(sends).where(eq(sends.uuid, id)).limit(1);
  const [file] = existing.type === 1
    ? await db.select().from(sendFiles).where(eq(sendFiles.sendUuid, id)).limit(1)
    : [];
  return jsonResponse(serializeSend(updated!, file));
}

// DELETE /api/sends/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const [send] = await db
    .select()
    .from(sends)
    .where(and(eq(sends.uuid, id), eq(sends.userUuid, auth.user.uuid)))
    .limit(1);
  if (!send) return notFound("Send not found");

  const blobOutcomes = await deleteSendBlobs(id);
  await db.delete(sends).where(eq(sends.uuid, id));
  return jsonResponse({
    object: "send",
    id,
    blobCleanup: blobOutcomes.some((outcome) => outcome.status !== "deleted") ? "partial" : "complete",
  });
}
