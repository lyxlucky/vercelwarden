import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folders, folderCiphers, attachments, sends } from "@/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { verifyAuth, buildProfile } from "@/lib/auth";
import { jsonResponse, unauthorized } from "@/lib/responses";
import { serializeCipher } from "@/lib/cipher";
import { serializeSend } from "@/lib/send";
import { serializeFolder } from "@/lib/folder";

// GET /api/sync?excludeDomains=true
// Wire format matches Vaultwarden ciphers.rs:121-202 — fully camelCase top-level
// with a `userDecryption.masterPasswordUnlock` sub-object that uses the newer
// (camelCase) MasterPasswordUnlock schema (note this differs from the token
// endpoint's PascalCase variant — upstream's own inconsistency).
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized();

  const { user } = auth;
  const origin = request.nextUrl.origin;
  const excludeDomains = request.nextUrl.searchParams.get("excludeDomains") === "true";

  const userCiphers = await db
    .select()
    .from(ciphers)
    .where(eq(ciphers.userUuid, user.uuid));

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

  const hasMasterPassword = (user.passwordHash as Uint8Array | null)?.length ?? 0 > 0;
  const masterPasswordUnlock = hasMasterPassword
    ? {
        kdf: {
          kdfType: user.clientKdfType,
          iterations: user.clientKdfIter,
          memory: user.clientKdfMemory,
          parallelism: user.clientKdfParallelism,
        },
        masterKeyEncryptedUserKey: user.akey,
        masterKeyWrappedUserKey: user.akey,
        salt: user.email,
      }
    : null;

  return jsonResponse({
    profile: buildProfile(user),
    folders: userFolders.map(serializeFolder),
    collections: [],
    policies: [],
    ciphers: userCiphers.map((c) =>
      serializeCipher(c, {
        folderId: folderByCipher.get(c.uuid) ?? null,
        attachments: attachmentsByCipher.get(c.uuid) ?? null,
        origin,
      })
    ),
    domains: excludeDomains
      ? null
      : {
          equivalentDomains: JSON.parse(user.equivalentDomains),
          globalEquivalentDomains: [],
          object: "domains",
        },
    sends: userSends.map(serializeSend),
    userDecryption: {
      masterPasswordUnlock,
    },
    object: "sync",
  });
}
