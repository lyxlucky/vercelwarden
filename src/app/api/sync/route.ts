import { NextRequest } from "next/server";
import { db } from "@/db";
import { ciphers, folders, folderCiphers, attachments, sendFiles, sends, userRevisions } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { verifyAuth, buildProfile } from "@/lib/auth";
import { unauthorized } from "@/lib/responses";
import { NextResponse } from "next/server";
import { serializeCipher } from "@/lib/cipher";
import { serializeSend } from "@/lib/send";
import { serializeFolder } from "@/lib/folder";
import { projectCipherForLegacyClient } from "@/lib/server/vault/compatibility-serializer";

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
  const firstPartyClient = request.headers.get("x-vercelwarden-client") === "first-party-web";

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
        .where(and(inArray(attachments.cipherUuid, cipherUuids), eq(attachments.status, "complete")))
    : [];
  const attachmentsByCipher = new Map<string, typeof userAttachments>();
  for (const a of userAttachments) {
    const list = attachmentsByCipher.get(a.cipherUuid) ?? [];
    list.push(a);
    attachmentsByCipher.set(a.cipherUuid, list);
  }

  const userSends = await db.select().from(sends).where(eq(sends.userUuid, user.uuid));
  const userSendFiles = userSends.length
    ? await db.select().from(sendFiles).where(inArray(sendFiles.sendUuid, userSends.map((send) => send.uuid)))
    : [];
  const fileBySend = new Map(userSendFiles.map((file) => [file.sendUuid, file]));

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
  const [revision] = await db
    .select({ revisionDate: userRevisions.revisionDate, sequence: userRevisions.sequence })
    .from(userRevisions)
    .where(eq(userRevisions.userUuid, user.uuid))
    .limit(1);

  return NextResponse.json({
    profile: buildProfile(user),
    folders: userFolders.map(serializeFolder),
    collections: [],
    policies: [],
    ciphers: userCiphers.map((c) => {
      const serialized = serializeCipher(c, {
        folderId: folderByCipher.get(c.uuid) ?? null,
        attachments: attachmentsByCipher.get(c.uuid) ?? null,
        origin,
      });
      return firstPartyClient ? serialized : projectCipherForLegacyClient(serialized, c);
    }),
    domains: excludeDomains
      ? null
      : {
          equivalentDomains: JSON.parse(user.equivalentDomains),
          globalEquivalentDomains: [],
          object: "domains",
        },
    sends: userSends.map((send) => serializeSend(send, fileBySend.get(send.uuid))),
    userDecryption: {
      masterPasswordUnlock,
    },
    revisionDate: (revision?.revisionDate ?? user.updatedAt).toISOString(),
    sequence: revision?.sequence ?? 0,
    object: "sync",
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
