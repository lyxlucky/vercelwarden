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
import { readStoredDomainSettings } from "@/features/domains/store";
import { serializeDomainsForClient } from "@/features/domains/serialize";
import { apiErrorResponse } from "@/lib/server/http/errors";

// GET /api/sync?excludeDomains=true
// Wire format matches Vaultwarden ciphers.rs:121-202 — fully camelCase top-level
// with a `userDecryption.masterPasswordUnlock` sub-object that uses the newer
// (camelCase) MasterPasswordUnlock schema (note this differs from the token
// endpoint's PascalCase variant — upstream's own inconsistency).
export async function GET(request: NextRequest) {
  try {
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

    // Precedence: `>` binds tighter than `??`, so the original
    // `(...)?.length ?? 0 > 0` evaluated as `length ?? (0 > 0)`. Parenthesize
    // the nullish-coalescing so this is genuinely "has a non-empty hash".
    const hasMasterPassword = ((user.passwordHash as Uint8Array | null)?.length ?? 0) > 0;
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

    // Equivalent-domain data for stock Bitwarden clients (autofill matching).
    // The first-party web client requests `?excludeDomains=true` and never reads
    // this, so it stays null on that path.
    const clientDomains = excludeDomains
      ? null
      : serializeDomainsForClient(await readStoredDomainSettings(user));

    // Serialize per row defensively: a single malformed cipher/folder/send must
    // not fail the entire vault sync. Bad rows are logged with their id (so the
    // offending record is recoverable from logs) and skipped.
    const serializedFolders = userFolders.flatMap((folder) => {
      try {
        return [serializeFolder(folder)];
      } catch (error) {
        console.error(`[api/sync] failed to serialize folder ${folder.uuid}`, error);
        return [];
      }
    });

    const serializedCiphers = userCiphers.flatMap((c) => {
      try {
        const serialized = serializeCipher(c, {
          folderId: folderByCipher.get(c.uuid) ?? null,
          attachments: attachmentsByCipher.get(c.uuid) ?? null,
          origin,
        });
        return [firstPartyClient ? serialized : projectCipherForLegacyClient(serialized, c)];
      } catch (error) {
        console.error(`[api/sync] failed to serialize cipher ${c.uuid}`, error);
        return [];
      }
    });

    const serializedSends = userSends.flatMap((send) => {
      try {
        return [serializeSend(send, fileBySend.get(send.uuid))];
      } catch (error) {
        console.error(`[api/sync] failed to serialize send ${send.uuid}`, error);
        return [];
      }
    });

    return NextResponse.json({
      profile: buildProfile(user),
      folders: serializedFolders,
      collections: [],
      policies: [],
      ciphers: serializedCiphers,
      domains: clientDomains,
      sends: serializedSends,
      userDecryption: {
        masterPasswordUnlock,
      },
      revisionDate: (revision?.revisionDate ?? user.updatedAt).toISOString(),
      sequence: revision?.sequence ?? 0,
      object: "sync",
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    // Previously uncaught: any throw here surfaced as an opaque 500 with no body
    // and no tagged log line. Log with a stable prefix and return the repo's
    // structured error envelope so the failure is diagnosable in Vercel logs.
    console.error("[api/sync] unhandled error", error);
    return apiErrorResponse(error);
  }
}
