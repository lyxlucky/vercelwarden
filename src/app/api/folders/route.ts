import { NextRequest } from "next/server";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";

// GET /api/folders — list all folders
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const userFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.userUuid, auth.user.uuid));

  return jsonResponse({
    data: userFolders.map(serializeFolder),
    object: "list",
    continuationToken: null,
  });
}

// POST /api/folders — create a folder
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json();
  const now = new Date();
  const folderId = newUuid();

  await db.insert(folders).values({
    uuid: folderId,
    userUuid: auth.user.uuid,
    createdAt: now,
    updatedAt: now,
    name: body.Name,
  });

  const [created] = await db.select().from(folders).where(eq(folders.uuid, folderId)).limit(1);
  return jsonResponse(serializeFolder(created!));
}

export function serializeFolder(folder: typeof folders.$inferSelect) {
  return {
    Id: folder.uuid,
    Name: folder.name,
    RevisionDate: folder.updatedAt.toISOString(),
    Object: "folder",
  };
}
