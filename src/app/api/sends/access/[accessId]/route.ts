import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sendFiles, users } from "@/db/schema";
import { errorResponse, jsonResponse, notFound } from "@/lib/responses";
import { serializeSendAccess, uuidFromAccessId } from "@/lib/send";
import { consumeSendAccess, peekSendAccess } from "@/lib/server/sends/service";

async function creatorEmail(hideEmail: boolean, userUuid: string) {
  if (hideEmail) return null;
  const [owner] = await db.select().from(users).where(eq(users.uuid, userUuid)).limit(1);
  return owner?.email ?? null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ accessId: string }> }) {
  const { accessId } = await params;
  const body = await request.json().catch(() => ({}));
  const sendUuid = uuidFromAccessId(accessId);
  if (!sendUuid) return notFound("Send not found");
  const password = typeof body?.password === "string" ? body.password : undefined;

  // Verify availability + password without spending an access, and learn the type.
  const peek = await peekSendAccess(sendUuid, password);
  if (peek.status === "invalid_password") return errorResponse("Invalid password", 401);
  if (peek.status !== "ok") return notFound("Send not found or no longer available");

  if (peek.send.type === 1) {
    // File Send: return metadata only. The access is consumed at download time
    // (see the file download route), so merely opening the link — or a
    // link-preview bot — never spends it.
    const [file] = await db.select().from(sendFiles).where(eq(sendFiles.sendUuid, peek.send.uuid)).limit(1);
    if (!file || file.status !== "complete") return notFound("Send file not found");
    const creatorIdentifier = await creatorEmail(peek.send.hideEmail, peek.send.userUuid);
    return jsonResponse(serializeSendAccess(peek.send, creatorIdentifier, file, null));
  }

  // Text Send: viewing IS the access — consume it now.
  const result = await db.transaction((tx) => consumeSendAccess(tx, sendUuid, password));
  if (result.status === "invalid_password") return errorResponse("Invalid password", 401);
  if (result.status !== "ok") return notFound("Send not found or no longer available");
  const creatorIdentifier = await creatorEmail(result.send.hideEmail, result.send.userUuid);
  return jsonResponse(serializeSendAccess(result.send, creatorIdentifier, null, null));
}
