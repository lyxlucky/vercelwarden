import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ciphers, folderCiphers, folders } from "@/db/schema";
import { ApiError } from "@/lib/server/http/errors";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CipherLifecycleAction = "archive" | "unarchive" | "trash" | "restore";
export type CipherRevisionPrecondition = Date | "force" | null;
export type BulkOutcomeStatus = "succeeded" | "conflict" | "not_found" | "failed";

export interface BulkMutationOutcome {
  status: BulkOutcomeStatus;
  code?: string;
  revisionDate?: Date;
}

export function cipherStatePatch(action: CipherLifecycleAction, now = new Date()) {
  if (action === "archive") return { archivedAt: now, deletedAt: null, updatedAt: now } as const;
  if (action === "unarchive") return { archivedAt: null, updatedAt: now } as const;
  if (action === "trash") return { archivedAt: null, deletedAt: now, updatedAt: now } as const;
  return { deletedAt: null, updatedAt: now } as const;
}

export function formatCipherEtag(updatedAt: Date): string {
  return `"${updatedAt.toISOString()}"`;
}

export function parseCipherRevisionPrecondition(
  ifMatch: string | null | undefined,
  lastKnownRevisionDate: string | null | undefined
): CipherRevisionPrecondition {
  const raw = ifMatch?.trim();
  if (raw === "*") return "force";
  const value = raw?.replace(/^W\//, "").replace(/^"|"$/g, "") || lastKnownRevisionDate?.trim();
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "invalid_revision", "The cipher revision precondition is invalid.");
  }
  return parsed;
}

export function assertCipherRevision(
  current: Date,
  precondition: CipherRevisionPrecondition
): void {
  if (!precondition || precondition === "force") return;
  if (current.getTime() !== precondition.getTime()) {
    throw new ApiError(409, "revision_conflict", "The cipher changed since it was loaded.", {
      currentRevisionDate: [current.toISOString()],
      currentEtag: [formatCipherEtag(current)],
    });
  }
}

export function buildBulkMutationResult(
  operation: string,
  requestedIds: string[],
  resolved: ReadonlyMap<string, BulkMutationOutcome>
) {
  const outcomes = requestedIds.map((id) => {
    const outcome = resolved.get(id) ?? { status: "not_found" as const, code: "not_found" };
    return {
      id,
      status: outcome.status,
      ...(outcome.code ? { code: outcome.code } : {}),
      ...(outcome.revisionDate ? { revisionDate: outcome.revisionDate.toISOString() } : {}),
    };
  });
  const succeeded = outcomes.filter((outcome) => outcome.status === "succeeded").length;
  return {
    object: "bulkMutation" as const,
    operation,
    succeeded,
    failed: outcomes.length - succeeded,
    outcomes,
  };
}

export function buildFolderDeletionResult(id: string, itemsUnlinked: number) {
  return { object: "folder" as const, id, itemsUnlinked, itemsDeleted: 0 as const };
}

export async function findOwnedCipher(userUuid: string, cipherUuid: string) {
  const [cipher] = await db
    .select()
    .from(ciphers)
    .where(and(eq(ciphers.uuid, cipherUuid), eq(ciphers.userUuid, userUuid)))
    .limit(1);
  return cipher ?? null;
}

export async function findCipherFolderId(cipherUuid: string): Promise<string | null> {
  const [link] = await db
    .select({ folderUuid: folderCiphers.folderUuid })
    .from(folderCiphers)
    .where(eq(folderCiphers.cipherUuid, cipherUuid))
    .limit(1);
  return link?.folderUuid ?? null;
}

export async function findOwnedCipherIds(userUuid: string, requestedIds: string[]) {
  if (requestedIds.length === 0) return [];
  return db
    .select({ uuid: ciphers.uuid, updatedAt: ciphers.updatedAt })
    .from(ciphers)
    .where(and(eq(ciphers.userUuid, userUuid), inArray(ciphers.uuid, requestedIds)));
}

export async function setCipherFolder(
  tx: DatabaseTransaction,
  input: { userUuid: string; cipherUuid: string; folderUuid: string | null }
) {
  if (input.folderUuid) {
    const [ownedFolder] = await tx
      .select({ uuid: folders.uuid })
      .from(folders)
      .where(and(eq(folders.uuid, input.folderUuid), eq(folders.userUuid, input.userUuid)))
      .limit(1);
    if (!ownedFolder) throw new ApiError(404, "not_found", "The requested folder was not found.");
  }
  await tx.delete(folderCiphers).where(eq(folderCiphers.cipherUuid, input.cipherUuid));
  if (input.folderUuid) {
    await tx.insert(folderCiphers).values({ folderUuid: input.folderUuid, cipherUuid: input.cipherUuid });
  }
}

export async function mutateCipherState(
  tx: DatabaseTransaction,
  input: { userUuid: string; cipherUuid: string; action: CipherLifecycleAction; now?: Date }
) {
  const now = input.now ?? new Date();
  await tx
    .update(ciphers)
    .set(cipherStatePatch(input.action, now))
    .where(and(eq(ciphers.uuid, input.cipherUuid), eq(ciphers.userUuid, input.userUuid)));
  return now;
}

export async function permanentlyDeleteCipher(
  tx: DatabaseTransaction,
  input: { userUuid: string; cipherUuid: string }
) {
  await tx
    .delete(ciphers)
    .where(and(eq(ciphers.uuid, input.cipherUuid), eq(ciphers.userUuid, input.userUuid)));
}
