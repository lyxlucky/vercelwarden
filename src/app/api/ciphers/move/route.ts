import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ciphers } from "@/db/schema";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { ApiError, parseJsonBody, withApiHandler } from "@/lib/server/http/errors";
import { commitUserMutation } from "@/lib/server/mutations/commit";
import {
  assertCipherRevision,
  buildBulkMutationResult,
  findOwnedCipherIds,
  parseCipherRevisionPrecondition,
  setCipherFolder,
  type BulkMutationOutcome,
} from "@/lib/server/vault/cipher-repository";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1_000),
  folderId: z.string().min(1).nullable(),
  revisions: z.record(z.string(), z.string()).optional(),
});

export const POST = withApiHandler(async (request: Request) => {
  const auth = await authenticateRequest(request);
  const body = await parseJsonBody(request, schema, 128 * 1024);
  const requestedIds = Array.from(new Set(body.ids));
  const owned = await findOwnedCipherIds(auth.user.uuid, requestedIds);
  const outcomes = new Map<string, BulkMutationOutcome>();
  const mutable = owned.filter((cipher) => {
    try {
      assertCipherRevision(
        cipher.updatedAt,
        parseCipherRevisionPrecondition(null, body.revisions?.[cipher.uuid])
      );
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        outcomes.set(cipher.uuid, { status: "conflict", code: error.code });
        return false;
      }
      throw error;
    }
  });

  if (mutable.length > 0) {
    const now = new Date();
    await commitUserMutation({
      userUuid: auth.user.uuid,
      resourceKind: "cipher",
      actingDeviceIdentifier: auth.device.identifier,
      mutate: async (tx) => {
        for (const cipher of mutable) {
          await setCipherFolder(tx, {
            userUuid: auth.user.uuid,
            cipherUuid: cipher.uuid,
            folderUuid: body.folderId,
          });
          await tx.update(ciphers).set({ updatedAt: now }).where(eq(ciphers.uuid, cipher.uuid));
        }
      },
    });
    for (const cipher of mutable) outcomes.set(cipher.uuid, { status: "succeeded", revisionDate: now });
  }

  return NextResponse.json(buildBulkMutationResult("move", requestedIds, outcomes), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
});

export const PUT = POST;
