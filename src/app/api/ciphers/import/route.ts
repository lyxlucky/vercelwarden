import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ciphers, folderCiphers, folders } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { extractCipherData } from "@/lib/cipher";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { ApiError, parseJsonBody, withApiHandler } from "@/lib/server/http/errors";
import {
  beginIdempotentRequest,
  completeIdempotentRequest,
  fingerprintBody,
} from "@/lib/server/idempotency/service";
import { commitUserMutation } from "@/lib/server/mutations/commit";

const encryptedText = z.string().min(1).max(2_000_000);
const importFolder = z.object({
  sourceId: z.string().min(1).max(200),
  name: encryptedText,
  targetId: z.string().min(1).max(100).nullable().optional(),
}).strict();
const importCipher = z.object({
  sourceId: z.string().min(1).max(200),
  folderSourceId: z.string().min(1).max(200).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
}).strict();
const importSchema = z.object({
  folderStrategy: z.enum(["preserve", "merge", "flatten"]),
  folders: z.array(importFolder).max(10_000),
  ciphers: z.array(importCipher).min(1).max(10_000),
}).strict();

function pick<T>(body: Record<string, unknown>, camel: string, pascal: string, fallback?: T): T {
  return (body[camel] ?? body[pascal] ?? fallback) as T;
}

function validateCipherPayload(payload: Record<string, unknown>) {
  const type = Number(payload.type ?? payload.Type);
  if (!Number.isInteger(type) || type < 1 || type > 8) throw new ApiError(400, "invalid_cipher_type", "Imported cipher type is unsupported.");
  const name = payload.name ?? payload.Name;
  if (typeof name !== "string" || !name || name.length > 2_000_000) throw new ApiError(400, "invalid_cipher_name", "Imported cipher name is invalid.");
  if (Array.isArray(payload.fields) && payload.fields.length > 1_000) throw new ApiError(400, "field_limit", "An imported item has too many custom fields.");
  if (Array.isArray(payload.passwordHistory) && payload.passwordHistory.length > 1_000) throw new ApiError(400, "history_limit", "An imported item has too much password history.");
  return { type, name };
}

export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await authenticateRequest(request);
  const body = await parseJsonBody(request, importSchema, 100 * 1024 * 1024);
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  const scope = `cipher-import:${auth.user.uuid}`;
  const requestHash = await fingerprintBody(body);
  const state = await beginIdempotentRequest({ scope, key: idempotencyKey, requestHash, userUuid: auth.user.uuid });
  if (state.decision === "replay") {
    return NextResponse.json(JSON.parse(state.record.responseBody ?? "{}"), {
      status: state.record.responseStatus ?? 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
  if (state.decision === "pending") throw new ApiError(409, "import_pending", "An identical import is still pending.");

  const sourceIds = new Set<string>();
  for (const cipher of body.ciphers) {
    if (sourceIds.has(cipher.sourceId)) throw new ApiError(400, "duplicate_source_id", "Import source ids must be unique.");
    sourceIds.add(cipher.sourceId);
    validateCipherPayload(cipher.payload);
  }
  const targetIds = body.folderStrategy === "merge"
    ? body.folders.map((folder) => folder.targetId).filter((id): id is string => Boolean(id))
    : [];
  const ownedTargets = targetIds.length
    ? await db.select().from(folders).where(and(eq(folders.userUuid, auth.user.uuid), inArray(folders.uuid, targetIds)))
    : [];
  if (ownedTargets.length !== new Set(targetIds).size) throw new ApiError(400, "invalid_folder_target", "An import folder target is not owned by the current user.");

  const folderMap = new Map<string, string>();
  const cipherMap = new Map<string, string>();
  const now = new Date();
  await commitUserMutation({
    userUuid: auth.user.uuid,
    resourceKind: "import",
    resourceId: idempotencyKey,
    actingDeviceIdentifier: auth.device.identifier,
    mutate: async (tx) => {
      if (body.folderStrategy !== "flatten") {
        for (const folder of body.folders) {
          if (body.folderStrategy === "merge" && folder.targetId) {
            folderMap.set(folder.sourceId, folder.targetId);
            continue;
          }
          const folderId = newUuid();
          await tx.insert(folders).values({ uuid: folderId, userUuid: auth.user.uuid, name: folder.name, createdAt: now, updatedAt: now });
          folderMap.set(folder.sourceId, folderId);
        }
      }

      for (const source of body.ciphers) {
        const payload = source.payload;
        const { type, name } = validateCipherPayload(payload);
        const cipherId = newUuid();
        cipherMap.set(source.sourceId, cipherId);
        await tx.insert(ciphers).values({
          uuid: cipherId,
          userUuid: auth.user.uuid,
          organizationUuid: null,
          createdAt: now,
          updatedAt: now,
          type,
          name,
          notes: pick<string | null>(payload, "notes", "Notes", null),
          fields: Array.isArray(payload.fields ?? payload.Fields) ? JSON.stringify(payload.fields ?? payload.Fields) : null,
          data: JSON.stringify(extractCipherData(payload)),
          key: pick<string | null>(payload, "key", "Key", null),
          passwordHistory: Array.isArray(payload.passwordHistory ?? payload.PasswordHistory) ? JSON.stringify(payload.passwordHistory ?? payload.PasswordHistory) : null,
          favorite: pick<boolean>(payload, "favorite", "Favorite", false),
          edit: true,
          reprompt: pick<number>(payload, "reprompt", "Reprompt", 0),
        });
        const folderId = source.folderSourceId ? folderMap.get(source.folderSourceId) : null;
        if (folderId) await tx.insert(folderCiphers).values({ cipherUuid: cipherId, folderUuid: folderId });
      }
    },
  });

  const responseBody = {
    object: "importResult",
    status: "completed",
    imported: body.ciphers.length,
    failed: 0,
    foldersCreated: Array.from(folderMap.values()).filter((id) => !targetIds.includes(id)).length,
    folderMap: Object.fromEntries(folderMap),
    itemMap: Object.fromEntries(cipherMap),
    outcomes: body.ciphers.map((cipher) => ({ sourceId: cipher.sourceId, id: cipherMap.get(cipher.sourceId), status: "imported" })),
  };
  await completeIdempotentRequest(scope, idempotencyKey, { status: 200, body: responseBody });
  return NextResponse.json(responseBody, { headers: { "Cache-Control": "no-store, max-age=0" } });
});
