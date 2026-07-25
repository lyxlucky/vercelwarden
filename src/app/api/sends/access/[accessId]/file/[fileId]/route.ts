import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sendFiles } from "@/db/schema";
import { errorResponse, jsonResponse, notFound } from "@/lib/responses";
import { uuidFromAccessId } from "@/lib/send";
import {
  consumeSendAccess,
  issueSendFileDownloadToken,
  verifySendFileDownloadToken,
} from "@/lib/server/sends/service";

async function completeFile(sendUuid: string, fileUuid: string) {
  const [file] = await db.select().from(sendFiles).where(and(
    eq(sendFiles.uuid, fileUuid),
    eq(sendFiles.sendUuid, sendUuid)
  )).limit(1);
  return file?.status === "complete" && file.blobUrl ? file : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accessId: string; fileId: string }> }
) {
  const { accessId, fileId } = await params;
  const sendUuid = uuidFromAccessId(accessId);
  if (!sendUuid) return notFound("Send not found");
  const claims = verifySendFileDownloadToken(request.nextUrl.searchParams.get("token") ?? "");
  if (!claims || claims.sendUuid !== sendUuid || claims.fileUuid !== fileId) {
    return errorResponse("Send file download token is invalid or expired", 401);
  }
  const file = await completeFile(sendUuid, fileId);
  if (!file) return notFound("File not found");
  return NextResponse.redirect(file.blobUrl, { status: 302, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accessId: string; fileId: string }> }
) {
  const { accessId, fileId } = await params;
  const sendUuid = uuidFromAccessId(accessId);
  if (!sendUuid) return notFound("Send not found");
  const body = await request.json().catch(() => ({})) as { password?: string; downloadToken?: string };
  let token = body.downloadToken ?? "";
  let claims = verifySendFileDownloadToken(token);
  if (!claims) {
    const result = await db.transaction((tx) => consumeSendAccess(tx, sendUuid, body.password));
    if (result.status === "invalid_password") return errorResponse("Invalid password", 401);
    if (result.status !== "ok" || result.send.type !== 1) return notFound("Send not found or no longer available");
    const issued = issueSendFileDownloadToken({ sendUuid, fileUuid: fileId });
    token = issued.token;
    claims = verifySendFileDownloadToken(token);
  }
  if (!claims || claims.sendUuid !== sendUuid || claims.fileUuid !== fileId) return errorResponse("Invalid download authorization", 401);
  const file = await completeFile(sendUuid, fileId);
  if (!file) return notFound("File not found");
  return jsonResponse({
    object: "send-file-download",
    id: file.uuid,
    url: `${request.nextUrl.origin}/api/sends/access/${encodeURIComponent(accessId)}/file/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}`,
    checksum: file.checksum,
  });
}
