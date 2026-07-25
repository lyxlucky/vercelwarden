import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ciphers } from "@/db/schema";
import { extractCipherData, serializeCipher } from "@/lib/cipher";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { ApiError, withApiHandler } from "@/lib/server/http/errors";
import { commitUserMutation } from "@/lib/server/mutations/commit";
import {
  assertCipherRevision,
  findCipherFolderId,
  findOwnedCipher,
  formatCipherEtag,
  parseCipherRevisionPrecondition,
  setCipherFolder,
} from "@/lib/server/vault/cipher-repository";
import { createSingleLifecycleHandler } from "@/lib/server/vault/mutation-handlers";
import { hasMatchingOpaqueProjection } from "@/lib/server/vault/compatibility-serializer";

function pick<T = unknown>(body: Record<string, unknown>, camel: string, pascal: string, fallback?: T): T {
  const value = body[camel] ?? body[pascal];
  return (value as T) ?? (fallback as T);
}

function cipherResponse(cipher: NonNullable<Awaited<ReturnType<typeof findOwnedCipher>>>, folderId: string | null) {
  return NextResponse.json(serializeCipher(cipher, { folderId }), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ETag: formatCipherEtag(cipher.updatedAt),
    },
  });
}

export const GET = withApiHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  const { id } = await context.params;
  const cipher = await findOwnedCipher(auth.user.uuid, id);
  if (!cipher) throw new ApiError(404, "not_found", "The requested cipher was not found.");
  return cipherResponse(cipher, await findCipherFolderId(id));
});

export const PUT = withApiHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  const { id } = await context.params;
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(400, "invalid_json", "Request body is not valid JSON.");
  }
  const body = raw as Record<string, unknown>;
  const existing = await findOwnedCipher(auth.user.uuid, id);
  if (!existing) throw new ApiError(404, "not_found", "The requested cipher was not found.");
  const legacyRevision = pick<string | null>(body, "lastKnownRevisionDate", "LastKnownRevisionDate", null);
  assertCipherRevision(
    existing.updatedAt,
    parseCipherRevisionPrecondition(request.headers.get("if-match"), legacyRevision)
  );

  const hasNewTypeData = [
    "login", "Login", "secureNote", "SecureNote", "card", "Card",
    "identity", "Identity", "sshKey", "SshKey", "bankAccount", "BankAccount",
    "bank", "Bank", "drivingLicence", "DrivingLicence", "drivingLicense", "DrivingLicense",
    "passport", "Passport",
  ].some((key) => body[key] != null);
  const preserveExtendedPayload = existing.type >= 6 && hasMatchingOpaqueProjection(body, existing);
  const includesFolder = body.folderId !== undefined || body.FolderId !== undefined;
  const folderId = includesFolder
    ? pick<string | null>(body, "folderId", "FolderId", null)
    : await findCipherFolderId(id);
  const now = new Date();

  await commitUserMutation({
    userUuid: auth.user.uuid,
    resourceKind: "cipher",
    resourceId: id,
    actingDeviceIdentifier: auth.device.identifier,
    mutate: async (tx) => {
      await tx
        .update(ciphers)
        .set({
          name: pick<string>(body, "name", "Name", existing.name),
          notes: pick<string | null>(body, "notes", "Notes", existing.notes),
          fields: !preserveExtendedPayload && (body.fields || body.Fields) ? JSON.stringify(body.fields ?? body.Fields) : existing.fields,
          data: hasNewTypeData && !preserveExtendedPayload ? JSON.stringify(extractCipherData(body)) : existing.data,
          key: pick<string | null>(body, "key", "Key", existing.key),
          passwordHistory: !preserveExtendedPayload && (body.passwordHistory || body.PasswordHistory)
            ? JSON.stringify(body.passwordHistory ?? body.PasswordHistory)
            : existing.passwordHistory,
          favorite: pick<boolean>(body, "favorite", "Favorite", existing.favorite),
          edit: pick<boolean>(body, "edit", "Edit", existing.edit),
          reprompt: pick<number>(body, "reprompt", "Reprompt", existing.reprompt),
          updatedAt: now,
        })
        .where(and(eq(ciphers.uuid, id), eq(ciphers.userUuid, auth.user.uuid)));
      if (includesFolder) {
        await setCipherFolder(tx, { userUuid: auth.user.uuid, cipherUuid: id, folderUuid: folderId });
      }
    },
  });

  const updated = await findOwnedCipher(auth.user.uuid, id);
  if (!updated) throw new ApiError(404, "not_found", "The requested cipher was not found.");
  return cipherResponse(updated, folderId);
});

export const DELETE = createSingleLifecycleHandler("trash");
