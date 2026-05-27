import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { sends } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";
import { serializeSend } from "@/lib/send";

// POST /api/sends/file — create a file send (multipart).
// fields: model (JSON metadata), data (binary)
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
  const deletionDate = model.DeletionDate || model.deletionDate;
  if (!deletionDate) return errorResponse("DeletionDate is required");

  const fileData = {
    Id: fileId,
    FileName: (model.FileName ?? (model.File as Record<string, unknown>)?.FileName) as string,
    Size: file.size,
    SizeName: null,
    url: blob.url,
  };

  await db.insert(sends).values({
    uuid: id,
    userUuid: auth.user.uuid,
    name: (model.Name ?? "") as string,
    notes: (model.Notes ?? null) as string | null,
    type: 1,
    data: JSON.stringify(fileData),
    key: (model.Key ?? "") as string,
    password: (model.Password ?? null) as string | null,
    maxAccessCount: (model.MaxAccessCount ?? null) as number | null,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    expirationDate: model.ExpirationDate
      ? new Date(model.ExpirationDate as string)
      : null,
    deletionDate: new Date(deletionDate as string),
    disabled: (model.Disabled ?? false) as boolean,
    hideEmail: (model.HideEmail ?? false) as boolean,
  });

  const [created] = await db.select().from(sends).where(eq(sends.uuid, id)).limit(1);
  return jsonResponse(serializeSend(created!));
}
