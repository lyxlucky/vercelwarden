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

// POST /api/sends — create a text send
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");

  return createSend(auth.user.uuid, body);
}

export async function createSend(
  userUuid: string,
  body: Record<string, unknown>,
  override: Partial<typeof sends.$inferInsert> = {}
) {
  const id = newUuid();
  const now = new Date();

  const type = (body.Type ?? body.type ?? 0) as number;
  if (type !== 0 && type !== 1) return errorResponse("Invalid send type");

  const deletionDate = body.DeletionDate || body.deletionDate;
  if (!deletionDate) return errorResponse("DeletionDate is required");

  const data =
    type === 0
      ? (body.Text ?? body.text ?? {})
      : (body.File ?? body.file ?? {});

  await db.insert(sends).values({
    uuid: id,
    userUuid,
    name: (body.Name ?? body.name ?? "") as string,
    notes: (body.Notes ?? body.notes ?? null) as string | null,
    type,
    data: JSON.stringify(data),
    key: (body.Key ?? body.key ?? "") as string,
    password: (body.Password ?? body.password ?? null) as string | null,
    maxAccessCount:
      (body.MaxAccessCount ?? body.maxAccessCount ?? null) as number | null,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    expirationDate: body.ExpirationDate
      ? new Date(body.ExpirationDate as string)
      : null,
    deletionDate: new Date(deletionDate as string),
    disabled: (body.Disabled ?? body.disabled ?? false) as boolean,
    hideEmail: (body.HideEmail ?? body.hideEmail ?? false) as boolean,
    ...override,
  });

  const [created] = await db.select().from(sends).where(eq(sends.uuid, id)).limit(1);
  return jsonResponse(serializeSend(created!));
}
