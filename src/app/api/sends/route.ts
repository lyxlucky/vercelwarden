import { NextRequest } from "next/server";
import { db } from "@/db";
import { sends } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";
import { serializeSend } from "@/lib/send";

// GET /api/sends — list current user's sends
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const userSends = await db.select().from(sends).where(eq(sends.userUuid, auth.user.uuid));
  return jsonResponse({
    data: userSends.map(serializeSend),
    object: "list",
    continuationToken: null,
  });
}

// POST /api/sends — create a text send. SendData body (camelCase per
// Vaultwarden sends.rs:71-91): type, key, password?, maxAccessCount?,
// expirationDate?, deletionDate, disabled, hideEmail?, name, notes?, text?, file?
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorResponse("Invalid JSON body");

  const type = (body.type ?? body.Type) as number | undefined;
  if (type !== 0 && type !== 1) return errorResponse("type must be 0 (Text) or 1 (File)");

  const deletionDate = body.deletionDate ?? body.DeletionDate;
  if (!deletionDate) return errorResponse("deletionDate is required");

  const data =
    type === 0
      ? (body.text ?? body.Text ?? {})
      : (body.file ?? body.File ?? {});

  const id = newUuid();
  const now = new Date();
  const maxAccessCountRaw = body.maxAccessCount ?? body.MaxAccessCount;
  const maxAccessCount = typeof maxAccessCountRaw === "number"
    ? maxAccessCountRaw
    : typeof maxAccessCountRaw === "string"
      ? parseInt(maxAccessCountRaw)
      : null;

  await db.insert(sends).values({
    uuid: id,
    userUuid: auth.user.uuid,
    name: ((body.name ?? body.Name) as string) ?? "",
    notes: ((body.notes ?? body.Notes) as string | null) ?? null,
    type,
    data: JSON.stringify(data),
    key: ((body.key ?? body.Key) as string) ?? "",
    password: ((body.password ?? body.Password) as string | null) ?? null,
    maxAccessCount,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    expirationDate: body.expirationDate || body.ExpirationDate
      ? new Date((body.expirationDate ?? body.ExpirationDate) as string)
      : null,
    deletionDate: new Date(deletionDate as string),
    disabled: Boolean(body.disabled ?? body.Disabled ?? false),
    hideEmail: Boolean(body.hideEmail ?? body.HideEmail ?? false),
  });

  const [created] = await db.select().from(sends).where(eq(sends.uuid, id)).limit(1);
  return jsonResponse(serializeSend(created!));
}
