import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folders, folderCiphers, attachments, sends } from "@/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { verifyAuth, buildProfile } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";
import { serializeCipher } from "@/lib/cipher";
import { serializeSend } from "@/lib/send";

// GET /api/sync
// Returns all vault data for the authenticated user.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { user } = auth;
  const origin = request.nextUrl.origin;
  const excludeDomains = request.nextUrl.searchParams.get("excludeDomains") === "true";

  const userCiphers = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.userUuid, user.uuid), isNull(ciphers.deletedAt)));

  const userFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.userUuid, user.uuid));

  const cipherUuids = userCiphers.map((c) => c.uuid);
  const folderLinks = cipherUuids.length
    ? await db
        .select()
        .from(folderCiphers)
        .where(inArray(folderCiphers.cipherUuid, cipherUuids))
    : [];
  const folderByCipher = new Map(folderLinks.map((l) => [l.cipherUuid, l.folderUuid]));

  const userAttachments = cipherUuids.length
    ? await db
        .select()
        .from(attachments)
        .where(inArray(attachments.cipherUuid, cipherUuids))
    : [];
  const attachmentsByCipher = new Map<string, typeof userAttachments>();
  for (const a of userAttachments) {
    const list = attachmentsByCipher.get(a.cipherUuid) ?? [];
    list.push(a);
    attachmentsByCipher.set(a.cipherUuid, list);
  }

  const userSends = await db.select().from(sends).where(eq(sends.userUuid, user.uuid));

  const profile = buildProfile(user);

  return jsonResponse({
    Profile: {
      ...profile,
      Organizations: [],
      Providers: [],
      ProviderOrganizations: [],
      Object: "profile",
    },
    Folders: userFolders.map((f) => ({
      Id: f.uuid,
      Name: f.name,
      RevisionDate: f.updatedAt.toISOString(),
      Object: "folder",
    })),
    Collections: [],
    Ciphers: userCiphers.map((c) => {
      const cAtts = attachmentsByCipher.get(c.uuid);
      const att = cAtts
        ? cAtts.map((a) => ({
            Id: a.uuid,
            FileName: a.fileName,
            Size: a.fileSize,
            SizeName: null,
            Url: `${origin}/api/ciphers/${c.uuid}/attachment/${a.uuid}`,
            Key: a.key ?? null,
            Object: "attachment" as const,
          }))
        : null;
      return serializeCipher(c, {
        folderId: folderByCipher.get(c.uuid) ?? null,
        attachments: att,
      });
    }),
    Domains: excludeDomains
      ? null
      : {
          EquivalentDomains: JSON.parse(user.equivalentDomains),
          GlobalEquivalentDomains: [],
          Object: "domains",
        },
    Policies: [],
    Sends: userSends.map(serializeSend),
    UnofficialServer: true,
    Object: "sync",
  });
}
