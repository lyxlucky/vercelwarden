import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folderCiphers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyAuth, newUuid } from "@/lib/auth";
import { jsonResponse, unauthorized, errorResponse, notFound } from "@/lib/responses";

// GET /api/ciphers — list all ciphers for the user
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const userCiphers = await db
    .select()
    .from(ciphers)
    .where(eq(ciphers.userUuid, auth.user.uuid));

  return jsonResponse({
    data: userCiphers.map(serializeCipher),
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

  // Handle folder assignment
  if (body.FolderId) {
    await db.insert(folderCiphers).values({
      folderUuid: body.FolderId,
      cipherUuid: cipherId,
    });
  }

  // Fetch created cipher
  const [created] = await db.select().from(ciphers).where(eq(ciphers.uuid, cipherId)).limit(1);
  return jsonResponse(serializeCipher(created!), 200);
}

// ─── Helpers ──────────────────────────────────────────────
function extractCipherData(body: Record<string, unknown>) {
  // Extract type-specific data from the request body
  // Bitwarden client sends data in nested objects: Login, SecureNote, Card, Identity
  for (const key of ["Login", "SecureNote", "Card", "Identity"]) {
    if (body[key]) return body[key];
  }
  return {};
}

export function serializeCipher(cipher: typeof ciphers.$inferSelect) {
  return {
    Id: cipher.uuid,
    Type: cipher.type,
    Name: cipher.name,
    Notes: cipher.notes,
    Fields: cipher.fields ? JSON.parse(cipher.fields) : null,
    Login: cipher.type === 1 ? JSON.parse(cipher.data) : null,
    SecureNote: cipher.type === 2 ? JSON.parse(cipher.data) : null,
    Card: cipher.type === 3 ? JSON.parse(cipher.data) : null,
    Identity: cipher.type === 4 ? JSON.parse(cipher.data) : null,
    OrganizationId: cipher.organizationUuid,
    FolderId: null, // resolved from junction table
    Favorite: cipher.favorite,
    Edit: cipher.edit,
    Reprompt: cipher.reprompt,
    Key: cipher.key,
    PasswordHistory: cipher.passwordHistory ? JSON.parse(cipher.passwordHistory) : null,
    Attachments: null,
    CreationDate: cipher.createdAt.toISOString(),
    RevisionDate: cipher.updatedAt.toISOString(),
    DeletedDate: cipher.deletedAt?.toISOString() || null,
    Object: "cipher",
  };
}
