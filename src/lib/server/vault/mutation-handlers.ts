import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ciphers } from "@/db/schema";
import { serializeCipher } from "@/lib/cipher";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { ApiError, parseJsonBody, withApiHandler } from "@/lib/server/http/errors";
import { commitUserMutation } from "@/lib/server/mutations/commit";
import {
  assertCipherRevision,
  buildBulkMutationResult,
  findCipherFolderId,
  findOwnedCipher,
  findOwnedCipherIds,
  formatCipherEtag,
  mutateCipherState,
  parseCipherRevisionPrecondition,
  permanentlyDeleteCipher,
  type BulkMutationOutcome,
  type CipherLifecycleAction,
} from "@/lib/server/vault/cipher-repository";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1_000),
  revisions: z.record(z.string(), z.string()).optional(),
});

function successResponse(body: unknown, headers?: HeadersInit) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store, max-age=0", ...headers },
  });
}

export function createBulkLifecycleHandler(
  operation: string,
  action: CipherLifecycleAction | "delete-permanent"
) {
  return withApiHandler(async (request: Request) => {
    const auth = await authenticateRequest(request);
    const body = await parseJsonBody(request, bulkSchema, 128 * 1024);
    const requestedIds = Array.from(new Set(body.ids));
    const owned = await findOwnedCipherIds(auth.user.uuid, requestedIds);
    const outcomes = new Map<string, BulkMutationOutcome>();
    const mutable = owned.filter((cipher) => {
      const rawRevision = body.revisions?.[cipher.uuid];
      try {
        assertCipherRevision(
          cipher.updatedAt,
          parseCipherRevisionPrecondition(null, rawRevision)
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
          if (action === "delete-permanent") {
            for (const cipher of mutable) {
              await permanentlyDeleteCipher(tx, { userUuid: auth.user.uuid, cipherUuid: cipher.uuid });
            }
          } else {
            for (const cipher of mutable) {
              await mutateCipherState(tx, {
                userUuid: auth.user.uuid,
                cipherUuid: cipher.uuid,
                action,
                now,
              });
            }
          }
        },
      });
      for (const cipher of mutable) {
        outcomes.set(cipher.uuid, { status: "succeeded", revisionDate: now });
      }
    }

    return successResponse(buildBulkMutationResult(operation, requestedIds, outcomes));
  });
}

export function createSingleLifecycleHandler(
  action: CipherLifecycleAction | "delete-permanent"
) {
  return withApiHandler(async (
    request: Request,
    context: { params: Promise<{ id: string }> }
  ) => {
    const auth = await authenticateRequest(request);
    const { id } = await context.params;
    const existing = await findOwnedCipher(auth.user.uuid, id);
    if (!existing) throw new ApiError(404, "not_found", "The requested cipher was not found.");
    assertCipherRevision(
      existing.updatedAt,
      parseCipherRevisionPrecondition(
        request.headers.get("if-match"),
        request.headers.get("x-last-known-revision-date")
      )
    );

    const now = new Date();
    await commitUserMutation({
      userUuid: auth.user.uuid,
      resourceKind: "cipher",
      resourceId: id,
      actingDeviceIdentifier: auth.device.identifier,
      mutate: async (tx) => {
        if (action === "delete-permanent") {
          await permanentlyDeleteCipher(tx, { userUuid: auth.user.uuid, cipherUuid: id });
        } else {
          await mutateCipherState(tx, { userUuid: auth.user.uuid, cipherUuid: id, action, now });
        }
      },
    });

    if (action === "delete-permanent") {
      return successResponse({ object: "cipher", id, deleted: true });
    }
    const updated = await findOwnedCipher(auth.user.uuid, id);
    if (!updated) throw new ApiError(404, "not_found", "The requested cipher was not found.");
    return successResponse(
      serializeCipher(updated, { folderId: await findCipherFolderId(id) }),
      { ETag: formatCipherEtag(updated.updatedAt) }
    );
  });
}

export const bulkFavoriteHandler = withApiHandler(async (request: Request) => {
  const auth = await authenticateRequest(request);
  const body = await parseJsonBody(
    request,
    bulkSchema.extend({ favorite: z.boolean() }),
    128 * 1024
  );
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
        await tx
          .update(ciphers)
          .set({ favorite: body.favorite, updatedAt: now })
          .where(and(eq(ciphers.userUuid, auth.user.uuid), inArray(ciphers.uuid, mutable.map((item) => item.uuid))));
      },
    });
    for (const cipher of mutable) outcomes.set(cipher.uuid, { status: "succeeded", revisionDate: now });
  }
  return successResponse(buildBulkMutationResult("favorite", requestedIds, outcomes));
});
