import { NextRequest } from "next/server";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound } from "@/lib/responses";

function serializeFolder(folder: typeof folders.$inferSelect) {
  return {
    Id: folder.uuid,
    Name: folder.name,
    RevisionDate: folder.updatedAt.toISOString(),
    Object: "folder",
  };
}

// GET /api/folders/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.uuid, id), eq(folders.userUuid, auth.user.uuid)))
    .limit(1);

  if (!folder) return notFound("Folder not found");
  return jsonResponse(serializeFolder(folder));
}

// PUT /api/folders/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const [existing] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.uuid, id), eq(folders.userUuid, auth.user.uuid)))
    .limit(1);

  if (!existing) return notFound("Folder not found");

  await db
    .update(folders)
    .set({ name: body.Name ?? existing.name, updatedAt: new Date() })
    .where(eq(folders.uuid, id));

  const [updated] = await db.select().from(folders).where(eq(folders.uuid, id)).limit(1);
  return jsonResponse(serializeFolder(updated!));
}

// DELETE /api/folders/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.uuid, id), eq(folders.userUuid, auth.user.uuid)))
    .limit(1);

  if (!existing) return notFound("Folder not found");

  await db.delete(folders).where(eq(folders.uuid, id));
  return jsonResponse({ Object: "folder" });
}
