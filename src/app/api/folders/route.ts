import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { unauthorized, errorResponse } from "@/lib/responses";
import { serializeFolder } from "@/lib/folder";
import { commitUserMutation } from "@/lib/server/mutations/commit";

// GET /api/folders — list all folders for the current user.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const userFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.userUuid, auth.user.uuid));

  return NextResponse.json({
    data: userFolders.map(serializeFolder),
    object: "list",
    continuationToken: null,
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// POST /api/folders — create a new folder.
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => null);
  const name = body?.name ?? body?.Name;
  if (!name) return errorResponse("name is required");

  const now = new Date();
  const folderId = newUuid();

  await commitUserMutation({
    userUuid: auth.user.uuid,
    resourceKind: "folder",
    resourceId: folderId,
    actingDeviceIdentifier: auth.device.identifier,
    mutate: async (tx) => {
      await tx.insert(folders).values({
        uuid: folderId,
        userUuid: auth.user.uuid,
        createdAt: now,
        updatedAt: now,
        name,
      });
    },
  });

  const [created] = await db.select().from(folders).where(eq(folders.uuid, folderId)).limit(1);
  return NextResponse.json(serializeFolder(created!), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
