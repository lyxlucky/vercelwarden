import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folderCiphers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse } from "@/lib/responses";
import { extractCipherData, serializeCipher } from "@/lib/cipher";

// Read a cipher body field tolerating both camelCase (Vaultwarden 1.36.0)
// and legacy PascalCase. Bitwarden clients in the field send camelCase.
function pick<T = unknown>(body: Record<string, unknown>, camel: string, pascal: string, fallback?: T): T {
  const v = body[camel] ?? body[pascal];
  return (v as T) ?? (fallback as T);
}

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

  const raw = await request.json().catch(() => null);
  if (!raw) return errorResponse("Invalid JSON body");
  const body = raw as Record<string, unknown>;

  const type = pick<number>(body, "type", "Type");
  const name = pick<string>(body, "name", "Name");
  if (!type || !name) return errorResponse("type and name are required");

  const now = new Date();
  const cipherId = newUuid();

  await db.insert(ciphers).values({
    uuid: cipherId,
    userUuid: auth.user.uuid,
    organizationUuid: pick<string | null>(body, "organizationId", "OrganizationId", null),
    createdAt: now,
    updatedAt: now,
    type,
    name,
    notes: pick<string | null>(body, "notes", "Notes", null),
    fields: body.fields || body.Fields ? JSON.stringify(body.fields ?? body.Fields) : null,
    data: JSON.stringify(extractCipherData(body)),
    key: pick<string | null>(body, "key", "Key", null),
    passwordHistory:
      body.passwordHistory || body.PasswordHistory
        ? JSON.stringify(body.passwordHistory ?? body.PasswordHistory)
        : null,
    favorite: pick<boolean>(body, "favorite", "Favorite", false),
    edit: pick<boolean>(body, "edit", "Edit", true),
    reprompt: pick<number>(body, "reprompt", "Reprompt", 0),
  });

  const folderId = pick<string | null>(body, "folderId", "FolderId", null);
  if (folderId) {
    await db.insert(folderCiphers).values({ folderUuid: folderId, cipherUuid: cipherId });
  }

  const [created] = await db.select().from(ciphers).where(eq(ciphers.uuid, cipherId)).limit(1);
  return jsonResponse(serializeCipher(created!, { folderId }), 200);
}
