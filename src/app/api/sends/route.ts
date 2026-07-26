import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sendFiles, sends } from "@/db/schema";
import { verifyAuth, newUuid } from "@/lib/auth";
import { unauthorized, errorResponse } from "@/lib/responses";
import { serializeSend } from "@/lib/send";
import { commitUserMutation } from "@/lib/server/mutations/commit";
import { deleteSendFileBlobs, hashSendPassword } from "@/lib/server/sends/service";

const noStore = { "Cache-Control": "no-store, max-age=0" };

function optionalCount(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function date(value: unknown, required = false) {
  if (value == null || value === "") return required ? null : undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const userSends = await db.select().from(sends).where(eq(sends.userUuid, auth.user.uuid));
  const files = userSends.length
    ? await db.select().from(sendFiles).where(inArray(sendFiles.sendUuid, userSends.map((send) => send.uuid)))
    : [];
  const fileBySend = new Map(files.map((file) => [file.sendUuid, file]));
  return NextResponse.json({
    data: userSends.map((send) => serializeSend(send, fileBySend.get(send.uuid))),
    object: "list",
    continuationToken: null,
  }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return errorResponse("Invalid JSON body");
  const type = Number(body.type ?? body.Type);
  if (type === 1) return errorResponse("File Sends must be created through /api/sends/file", 400);
  if (type !== 0) return errorResponse("type must be 0 (Text) or 1 (File)");
  const deletionDate = date(body.deletionDate ?? body.DeletionDate, true);
  const expirationDate = date(body.expirationDate ?? body.ExpirationDate);
  if (!deletionDate) return errorResponse("deletionDate must be a valid date");
  if (expirationDate === null) return errorResponse("expirationDate must be a valid date");
  if (deletionDate.getTime() <= Date.now()) return errorResponse("deletionDate must be in the future");
  const data = body.text ?? body.Text;
  if (!data || typeof data !== "object") return errorResponse("text is required");

  const id = newUuid();
  const now = new Date();
  const password = await hashSendPassword(
    typeof (body.password ?? body.Password) === "string" ? String(body.password ?? body.Password) : null
  );
  await commitUserMutation({
    userUuid: auth.user.uuid,
    resourceKind: "send",
    resourceId: id,
    actingDeviceIdentifier: auth.device.identifier,
    mutate: async (tx) => {
      await tx.insert(sends).values({
        uuid: id,
        userUuid: auth.user.uuid,
        name: String(body.name ?? body.Name ?? ""),
        notes: typeof (body.notes ?? body.Notes) === "string" ? String(body.notes ?? body.Notes) : null,
        type: 0,
        data: JSON.stringify(data),
        key: String(body.key ?? body.Key ?? ""),
        password,
        maxAccessCount: optionalCount(body.maxAccessCount ?? body.MaxAccessCount),
        accessCount: 0,
        createdAt: now,
        updatedAt: now,
        expirationDate: expirationDate ?? null,
        deletionDate,
        disabled: Boolean(body.disabled ?? body.Disabled ?? false),
        hideEmail: Boolean(body.hideEmail ?? body.HideEmail ?? false),
      });
    },
  });
  const [created] = await db.select().from(sends).where(eq(sends.uuid, id)).limit(1);
  return NextResponse.json(serializeSend(created!), { status: 201, headers: noStore });
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? Array.from(new Set(body.ids.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, 100)
    : [];
  if (ids.length === 0) return errorResponse("ids is required");
  const owned = await db.select().from(sends).where(and(eq(sends.userUuid, auth.user.uuid), inArray(sends.uuid, ids)));
  const ownedById = new Map(owned.map((send) => [send.uuid, send]));
  const ownedIds = owned.map((send) => send.uuid);
  // Capture blob URLs BEFORE deleting the rows — deletion cascades the file rows
  // away, so they must be read up front to be cleaned afterward.
  const ownedFiles = ownedIds.length
    ? await db.select().from(sendFiles).where(inArray(sendFiles.sendUuid, ownedIds))
    : [];
  const filesBySend = new Map<string, typeof ownedFiles>();
  for (const file of ownedFiles) {
    const list = filesBySend.get(file.sendUuid) ?? [];
    list.push(file);
    filesBySend.set(file.sendUuid, list);
  }
  // Delete rows first and commit; only then remove blobs, so a blob failure can
  // never leave an undeletable send row behind (previously blobs were deleted
  // first and a rolled-back transaction orphaned the row from its file).
  if (ownedIds.length > 0) {
    await commitUserMutation({
      userUuid: auth.user.uuid,
      resourceKind: "send",
      actingDeviceIdentifier: auth.device.identifier,
      mutate: async (tx) => {
        await tx.delete(sends).where(and(
          eq(sends.userUuid, auth.user.uuid),
          inArray(sends.uuid, ownedIds)
        ));
      },
    });
  }
  const outcomes = [] as Array<{ id: string; status: "deleted" | "not_found" | "partial"; code?: string }>;
  for (const id of ids) {
    if (!ownedById.has(id)) {
      outcomes.push({ id, status: "not_found", code: "not_found" });
      continue;
    }
    const blobs = await deleteSendFileBlobs(filesBySend.get(id) ?? []);
    outcomes.push(blobs.some((item) => item.status !== "deleted")
      ? { id, status: "partial", code: "blob_cleanup_failed" }
      : { id, status: "deleted" });
  }
  const succeeded = outcomes.filter((outcome) => outcome.status === "deleted").length;
  return NextResponse.json({ object: "bulkSendDelete", succeeded, failed: outcomes.length - succeeded, outcomes }, { headers: noStore });
}
