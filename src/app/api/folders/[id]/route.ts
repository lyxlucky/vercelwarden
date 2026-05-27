import { NextRequest } from "next/server";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth } from "@/lib/auth";
import { jsonResponse, unauthorized, notFound, errorResponse } from "@/lib/responses";
import { serializeFolder } from "@/lib/folder";

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
  const body = await request.json().catch(() => null);
  const newName = body?.name ?? body?.Name;
  if (!newName) return errorResponse("name is required");

  const [existing] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.uuid, id), eq(folders.userUuid, auth.user.uuid)))
    .limit(1);
  if (!existing) return notFound("Folder not found");

  await db
    .update(folders)
    .set({ name: newName, updatedAt: new Date() })
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
  return jsonResponse({ object: "folder" });
}
