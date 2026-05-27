import { NextRequest } from "next/server";
import { db } from "@/db";
import { sends } from "@/db/schema";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { jsonResponse, notFound, errorResponse } from "@/lib/responses";
import { safeJsonParse } from "@/lib/cipher";
import { uuidFromAccessId } from "@/lib/send";

// POST /api/sends/access/[accessId]/file/[fileId] — public; returns the
// download URL for a file send after access checks pass. `accessId` is the
// base64url-encoded UUID (Vaultwarden Send::find_by_access_id).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accessId: string; fileId: string }> }
) {
  const { accessId, fileId } = await params;
  const body = await request.json().catch(() => ({}));
  const password = body?.password as string | undefined;

  const sendUuid = uuidFromAccessId(accessId);
  if (!sendUuid) return notFound("Send not found");

  const [send] = await db.select().from(sends).where(eq(sends.uuid, sendUuid)).limit(1);
  if (!send || send.disabled || send.type !== 1) return notFound("Send not found");

  const now = new Date();
  if (send.deletionDate.getTime() <= now.getTime()) return notFound("Send has expired");
  if (send.expirationDate && send.expirationDate.getTime() <= now.getTime()) {
    return notFound("Send has expired");
  }
  if (send.maxAccessCount !== null && send.accessCount >= send.maxAccessCount) {
    return notFound("Send access limit reached");
  }

  if (send.password) {
    if (!password) {
      return errorResponse("Password required", 401, { password: ["Required"] });
    }
    const a = Buffer.from(password);
    const b = Buffer.from(send.password);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return errorResponse("Invalid password", 401);
    }
  }

  const data = safeJsonParse<{ id?: string; Id?: string; url?: string }>(send.data);
  const fileMatches = data && (data.id === fileId || data.Id === fileId);
  if (!data || !fileMatches || !data.url) return notFound("File not found");

  return jsonResponse({
    object: "send-file-download",
    id: send.uuid,
    url: data.url,
  });
}
