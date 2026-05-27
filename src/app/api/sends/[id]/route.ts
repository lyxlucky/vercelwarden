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

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");

  const dataField =
    existing.type === 0
      ? body.Text ?? body.text
      : body.File ?? body.file;

  await db
    .update(sends)
    .set({
      name: (body.Name ?? body.name ?? existing.name) as string,
      notes: (body.Notes ?? body.notes ?? existing.notes) as string | null,
      data: dataField ? JSON.stringify(dataField) : existing.data,
      key: (body.Key ?? body.key ?? existing.key) as string,
      password:
        body.Password === undefined && body.password === undefined
          ? existing.password
          : ((body.Password ?? body.password) as string | null),
      maxAccessCount:
        body.MaxAccessCount === undefined && body.maxAccessCount === undefined
          ? existing.maxAccessCount
          : ((body.MaxAccessCount ?? body.maxAccessCount) as number | null),
      expirationDate: body.ExpirationDate
        ? new Date(body.ExpirationDate as string)
        : existing.expirationDate,
      deletionDate: body.DeletionDate
        ? new Date(body.DeletionDate as string)
        : existing.deletionDate,
      disabled: (body.Disabled ?? body.disabled ?? existing.disabled) as boolean,
      hideEmail: (body.HideEmail ?? body.hideEmail ?? existing.hideEmail) as boolean,
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

  // Best-effort blob cleanup for file sends.
  if (send.type === 1) {
    const data = safeJsonParse<{ url?: string }>(send.data);
    if (data?.url) {
      try {
        await del(data.url);
      } catch {
        // ignore; best-effort
      }
    }
  }

  await db.delete(sends).where(eq(sends.uuid, id));
  return jsonResponse({ Object: "send" });
}
