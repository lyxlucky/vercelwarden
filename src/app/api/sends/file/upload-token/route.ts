import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { db } from "@/db";
import { sendFiles, sends } from "@/db/schema";
import { verifyAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/responses";
import {
  confirmSendFileUpload,
  encryptedCapForPlaintext,
  sendFileBlobPath,
  verifySendFileUploadCredential,
} from "@/lib/server/sends/service";

// POST /api/sends/file/upload-token — Vercel Blob client-upload handshake for
// browser→Blob direct Send file uploads. Two event types hit this route:
//   • blob.generate-client-token — authorize the browser's direct upload
//   • blob.upload-completed       — prod-only webhook (never fires in local dev)
// Security: the SDK bakes the client-supplied pathname into the token and gives
// no way to override it, so we do NOT trust it — we look the pending row up
// scoped to the authenticated user, re-verify the hashed 15-min upload token,
// and reject any pathname that isn't this file's one canonical location.
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request.headers.get("authorization"));
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return errorResponse("Invalid JSON body");
  }
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayloadRaw) => {
        if (!auth) throw new Error("Unauthorized");
        let payload: { sendId?: string; fileId?: string; uploadToken?: string };
        try {
          payload = JSON.parse(clientPayloadRaw ?? "{}");
        } catch {
          throw new Error("Invalid client payload");
        }
        const { sendId, fileId, uploadToken } = payload;
        if (!sendId || !fileId || !uploadToken) throw new Error("Missing upload authorization");
        const [send] = await db.select().from(sends)
          .where(and(eq(sends.uuid, sendId), eq(sends.userUuid, auth.user.uuid), eq(sends.type, 1))).limit(1);
        const [file] = await db.select().from(sendFiles)
          .where(and(eq(sendFiles.uuid, fileId), eq(sendFiles.sendUuid, sendId), eq(sendFiles.status, "pending"))).limit(1);
        if (!send || !file) throw new Error("Pending Send not found");
        if (!verifySendFileUploadCredential(uploadToken, file.uploadTokenHash, file.uploadExpiresAt)) {
          throw new Error("Upload token is invalid or expired");
        }
        if (pathname !== sendFileBlobPath(auth.user.uuid, sendId, fileId)) throw new Error("Upload path is not allowed");
        return {
          allowedContentTypes: ["application/octet-stream"],
          maximumSizeInBytes: encryptedCapForPlaintext(),
          addRandomSuffix: false,
          allowOverwrite: true, // idempotent retry within the 15-min window
          validUntil: file.uploadExpiresAt?.getTime(),
          tokenPayload: JSON.stringify({ userUuid: auth.user.uuid, sendId, fileId }),
        };
      },
      onUploadCompleted: async ({ tokenPayload }) => {
        // Prod safety net for clients that upload then crash before confirming.
        // The explicit PUT /api/sends/file confirm is the primary path (works in
        // local dev where this webhook can't reach localhost). Both are idempotent.
        let ids: { userUuid?: string; sendId?: string; fileId?: string };
        try {
          ids = JSON.parse(tokenPayload ?? "{}");
        } catch {
          return;
        }
        if (!ids.userUuid || !ids.sendId || !ids.fileId) return;
        await confirmSendFileUpload({ userUuid: ids.userUuid, sendUuid: ids.sendId, fileUuid: ids.fileId }).catch(() => undefined);
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to authorize upload", 400);
  }
}
