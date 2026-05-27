import { NextRequest } from "next/server";
import { db } from "@/db";
import { sends } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound, errorResponse } from "@/lib/responses";
import { serializeSend } from "@/lib/send";
import { safeJsonParse } from "@/lib/cipher";
import { del } from "@vercel/blob";

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
  return jsonResponse(serializeSend(send));
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
      name: ((body.name ?? body.Name) as string) ?? existing.name,
      notes: ((body.notes ?? body.Notes) as string | null) ?? existing.notes,
      data: dataField ? JSON.stringify(dataField) : existing.data,
      key: ((body.key ?? body.Key) as string) ?? existing.key,
      password: passwordProvided
        ? ((body.password ?? body.Password) as string | null) ?? null
        : existing.password,
      maxAccessCount: maxAccessProvided ? maxAccess : existing.maxAccessCount,
      expirationDate: body.expirationDate || body.ExpirationDate
        ? new Date((body.expirationDate ?? body.ExpirationDate) as string)
        : existing.expirationDate,
      deletionDate: body.deletionDate || body.DeletionDate
        ? new Date((body.deletionDate ?? body.DeletionDate) as string)
        : existing.deletionDate,
      disabled: Boolean(body.disabled ?? body.Disabled ?? existing.disabled),
      hideEmail: Boolean(body.hideEmail ?? body.HideEmail ?? existing.hideEmail),
      updatedAt: new Date(),
    })
    .where(eq(sends.uuid, id));

  const [updated] = await db.select().from(sends).where(eq(sends.uuid, id)).limit(1);
  return jsonResponse(serializeSend(updated!));
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

  if (send.type === 1) {
    const data = safeJsonParse<{ url?: string }>(send.data);
    if (data?.url) {
      try {
        await del(data.url);
      } catch {
        // best-effort
      }
    }
  }

  await db.delete(sends).where(eq(sends.uuid, id));
  return jsonResponse({ object: "send" });
}
