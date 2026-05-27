import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folderCiphers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";
import { extractCipherData, serializeCipher } from "@/lib/cipher";

// GET /api/ciphers — list all ciphers for the user
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const userCiphers = await db
    .select()
    .from(ciphers)
    .where(eq(ciphers.userUuid, auth.user.uuid));

  const cipherUuids = userCiphers.map((c) => c.uuid);
  const links = cipherUuids.length
    ? await db
        .select()
        .from(folderCiphers)
        .where(inArray(folderCiphers.cipherUuid, cipherUuids))
    : [];
  const folderByCipher = new Map(links.map((l) => [l.cipherUuid, l.folderUuid]));

  return jsonResponse({
    data: userCiphers.map((c) =>
      serializeCipher(c, { folderId: folderByCipher.get(c.uuid) ?? null })
    ),
    object: "list",
    continuationToken: null,
  });
}

// POST /api/ciphers — create a new cipher
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const body = await request.json();
  const now = new Date();
  const cipherId = newUuid();

  await db.insert(ciphers).values({
    uuid: cipherId,
    userUuid: auth.user.uuid,
    organizationUuid: body.OrganizationId || null,
    createdAt: now,
    updatedAt: now,
    type: body.Type,
    name: body.Name,
    notes: body.Notes || null,
    fields: body.Fields ? JSON.stringify(body.Fields) : null,
    data: JSON.stringify(extractCipherData(body)),
    key: body.Key || null,
    passwordHistory: body.PasswordHistory ? JSON.stringify(body.PasswordHistory) : null,
    favorite: body.Favorite || false,
    edit: body.Edit ?? true,
    reprompt: body.Reprompt || 0,
  });

  if (body.FolderId) {
    await db.insert(folderCiphers).values({
      folderUuid: body.FolderId,
      cipherUuid: cipherId,
    });
  }

  const [created] = await db.select().from(ciphers).where(eq(ciphers.uuid, cipherId)).limit(1);
  return jsonResponse(
    serializeCipher(created!, { folderId: body.FolderId ?? null }),
    200
  );
}
