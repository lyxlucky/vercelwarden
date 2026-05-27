import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { sends } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";
import { serializeSend } from "@/lib/send";

// POST /api/sends/file — create a file send (multipart).
// fields: model (JSON metadata, camelCase), data (binary)
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const formData = await request.formData();
  const file = formData.get("data") as File | null;
  const modelRaw = formData.get("model") as string | null;
  if (!file || !modelRaw) return errorResponse("Missing file or model");

  let model: Record<string, unknown>;
  try {
    model = JSON.parse(modelRaw);
  } catch {
    return errorResponse("Invalid model JSON");
  }

  const id = newUuid();
  const fileId = newUuid();
  const blobPath = `sends/${auth.user.uuid}/${id}/${fileId}`;
  const blob = await put(blobPath, file, {
    access: "public",
    addRandomSuffix: false,
  });

  const now = new Date();
  const deletionDate = model.deletionDate ?? model.DeletionDate;
  if (!deletionDate) return errorResponse("deletionDate is required");

  // File data stored on the Send (camelCase keys; size is string in response).
  const fileMeta = (model.file ?? model.File) as Record<string, unknown> | undefined;
  const fileData = {
    id: fileId,
    fileName:
      (model.fileName ?? model.FileName ?? fileMeta?.fileName ?? fileMeta?.FileName) as string,
    size: file.size,
    sizeName: null,
    url: blob.url,
  };

  await db.insert(sends).values({
    uuid: id,
    userUuid: auth.user.uuid,
    name: ((model.name ?? model.Name) as string) ?? "",
    notes: ((model.notes ?? model.Notes) as string | null) ?? null,
    type: 1,
    data: JSON.stringify(fileData),
    key: ((model.key ?? model.Key) as string) ?? "",
    password: ((model.password ?? model.Password) as string | null) ?? null,
    maxAccessCount: ((model.maxAccessCount ?? model.MaxAccessCount) as number | null) ?? null,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    expirationDate: model.expirationDate || model.ExpirationDate
      ? new Date((model.expirationDate ?? model.ExpirationDate) as string)
      : null,
    deletionDate: new Date(deletionDate as string),
    disabled: Boolean(model.disabled ?? model.Disabled ?? false),
    hideEmail: Boolean(model.hideEmail ?? model.HideEmail ?? false),
  });

  const [created] = await db.select().from(sends).where(eq(sends.uuid, id)).limit(1);
  return jsonResponse(serializeSend(created!));
}
