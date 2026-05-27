import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folders, folderCiphers, attachments } from "@/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { verifyAuth, buildProfile } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";

// GET /api/sync
// Returns all vault data for the authenticated user
// Matches Vaultwarden's sync response format exactly
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { user } = auth;

  // Fetch user's ciphers (not deleted)
  const userCiphers = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.userUuid, user.uuid), isNull(ciphers.deletedAt)));

  // Fetch user's folders
  const userFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.userUuid, user.uuid));

  // Fetch folder-cipher relationships for all user ciphers
  const cipherUuids = userCiphers.map((c) => c.uuid);
  let folderCipherLinks: typeof folderCiphers.$inferSelect[] = [];
  if (cipherUuids.length > 0) {
    folderCipherLinks = await db
      .select()
      .from(folderCiphers)
      .where(inArray(folderCiphers.cipherUuid, cipherUuids));
  }

  // Fetch attachments for all user ciphers
  let userAttachments: typeof attachments.$inferSelect[] = [];
  if (cipherUuids.length > 0) {
    userAttachments = await db
      .select()
      .from(attachments)
      .where(inArray(attachments.cipherUuid, cipherUuids));
  }

  // Build response matching Vaultwarden format
  const profile = buildProfile(user);

  return jsonResponse({
    profile: {
      ...profile,
      organizations: [],
      providers: [],
      providerOrganizations: [],
    },
    folders: userFolders.map((f) => ({
      Id: f.uuid,
      Name: f.name,
      RevisionDate: f.updatedAt.toISOString(),
      Object: "folder",
    })),
    collections: [],
    ciphers: userCiphers.map((c) => {
      const folderLink = folderCipherLinks.find((fc) => fc.cipherUuid === c.uuid);
      const cipherAttachments = userAttachments
        .filter((a) => a.cipherUuid === c.uuid)
        .map((a) => ({
          Id: a.uuid,
          FileName: a.fileName,
          Size: a.fileSize,
          SizeName: null,
          Url: `/api/ciphers/${c.uuid}/attachment/${a.uuid}`,
          Object: "attachment",
        }));

      return {
        Id: c.uuid,
        Type: c.type,
        Name: c.name,
        Notes: c.notes,
        Fields: c.fields ? JSON.parse(c.fields) : null,
        Login: c.type === 1 ? JSON.parse(c.data) : null,
        SecureNote: c.type === 2 ? JSON.parse(c.data) : null,
        Card: c.type === 3 ? JSON.parse(c.data) : null,
        Identity: c.type === 4 ? JSON.parse(c.data) : null,
        OrganizationId: c.organizationUuid,
        FolderId: folderLink?.folderUuid || null,
        Favorite: c.favorite,
        Edit: c.edit,
        Reprompt: c.reprompt,
        Key: c.key,
        PasswordHistory: c.passwordHistory ? JSON.parse(c.passwordHistory) : null,
        Attachments: cipherAttachments.length > 0 ? cipherAttachments : null,
        CreationDate: c.createdAt.toISOString(),
        RevisionDate: c.updatedAt.toISOString(),
        DeletedDate: c.deletedAt?.toISOString() || null,
        Object: "cipher",
      };
    }),
    domains: {
      EquivalentDomains: JSON.parse(user.equivalentDomains),
      GlobalEquivalentDomains: [],
      Object: "domains",
    },
    policies: [],
    sends: [],
    Object: "sync",
  });
}
