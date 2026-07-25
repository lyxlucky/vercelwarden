import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { folders, folderCiphers } from "@/db/schema";
import { serializeFolder } from "@/lib/folder";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { ApiError, withApiHandler } from "@/lib/server/http/errors";
import { commitUserMutation } from "@/lib/server/mutations/commit";
import { buildFolderDeletionResult } from "@/lib/server/vault/cipher-repository";

async function findOwnedFolder(userUuid: string, id: string) {
  const { db } = await import("@/db");
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.uuid, id), eq(folders.userUuid, userUuid)))
    .limit(1);
  return folder ?? null;
}

export const GET = withApiHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  const { id } = await context.params;
  const folder = await findOwnedFolder(auth.user.uuid, id);
  if (!folder) throw new ApiError(404, "not_found", "The requested folder was not found.");
  return NextResponse.json(serializeFolder(folder), { headers: { "Cache-Control": "no-store, max-age=0" } });
});

export const PUT = withApiHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const name = body?.name ?? body?.Name;
  if (typeof name !== "string" || !name.trim()) {
    throw new ApiError(400, "validation_error", "Folder name is required.", { name: ["Required"] });
  }
  const existing = await findOwnedFolder(auth.user.uuid, id);
  if (!existing) throw new ApiError(404, "not_found", "The requested folder was not found.");
  const now = new Date();
  await commitUserMutation({
    userUuid: auth.user.uuid,
    resourceKind: "folder",
    resourceId: id,
    actingDeviceIdentifier: auth.device.identifier,
    mutate: async (tx) => {
      await tx
        .update(folders)
        .set({ name, updatedAt: now })
        .where(and(eq(folders.uuid, id), eq(folders.userUuid, auth.user.uuid)));
    },
  });
  const updated = await findOwnedFolder(auth.user.uuid, id);
  return NextResponse.json(serializeFolder(updated!), { headers: { "Cache-Control": "no-store, max-age=0" } });
});

export const DELETE = withApiHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  const { id } = await context.params;
  const existing = await findOwnedFolder(auth.user.uuid, id);
  if (!existing) throw new ApiError(404, "not_found", "The requested folder was not found.");
  const result = await commitUserMutation({
    userUuid: auth.user.uuid,
    resourceKind: "folder",
    resourceId: id,
    actingDeviceIdentifier: auth.device.identifier,
    mutate: async (tx) => {
      const linked = await tx
        .select({ cipherUuid: folderCiphers.cipherUuid })
        .from(folderCiphers)
        .where(eq(folderCiphers.folderUuid, id));
      await tx.delete(folderCiphers).where(eq(folderCiphers.folderUuid, id));
      await tx
        .delete(folders)
        .where(and(eq(folders.uuid, id), eq(folders.userUuid, auth.user.uuid)));
      return buildFolderDeletionResult(id, linked.length);
    },
  });
  return NextResponse.json(result.value, { headers: { "Cache-Control": "no-store, max-age=0" } });
});
