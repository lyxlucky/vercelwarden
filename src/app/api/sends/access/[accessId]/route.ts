import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sendFiles, users } from "@/db/schema";
import { errorResponse, jsonResponse, notFound } from "@/lib/responses";
import { serializeSendAccess, uuidFromAccessId } from "@/lib/send";
import { consumeSendAccess, issueSendFileDownloadToken } from "@/lib/server/sends/service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ accessId: string }> }) {
  const { accessId } = await params;
  const body = await request.json().catch(() => ({}));
  const sendUuid = uuidFromAccessId(accessId);
  if (!sendUuid) return notFound("Send not found");
  const result = await db.transaction((tx) => consumeSendAccess(tx, sendUuid, typeof body?.password === "string" ? body.password : undefined));
  if (result.status === "invalid_password") return errorResponse("Invalid password", 401);
  if (result.status !== "ok") return notFound("Send not found or no longer available");
  let creatorIdentifier: string | null = null;
  if (!result.send.hideEmail) {
    const [owner] = await db.select().from(users).where(eq(users.uuid, result.send.userUuid)).limit(1);
    creatorIdentifier = owner?.email ?? null;
  }
  const [file] = result.send.type === 1
    ? await db.select().from(sendFiles).where(eq(sendFiles.sendUuid, result.send.uuid)).limit(1)
    : [];
  if (result.send.type === 1 && (!file || file.status !== "complete")) return notFound("Send file not found");
  const download = file
    ? issueSendFileDownloadToken({ sendUuid: result.send.uuid, fileUuid: file.uuid })
    : null;
  return jsonResponse(serializeSendAccess(result.send, creatorIdentifier, file, download));
}
