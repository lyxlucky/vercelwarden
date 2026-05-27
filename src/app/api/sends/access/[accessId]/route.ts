import { NextRequest } from "next/server";
import { db } from "@/db";
import { sends, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { jsonResponse, notFound, errorResponse } from "@/lib/responses";
import { serializeSendAccess } from "@/lib/send";

// POST /api/sends/access/[accessId] — public; recipients POST the access password.
// Returns the (still client-encrypted) Send payload using the to_json_access shape.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accessId: string }> }
) {
  const { accessId } = await params;
  const body = await request.json().catch(() => ({}));
  const password = body?.password as string | undefined;

  const [send] = await db.select().from(sends).where(eq(sends.uuid, accessId)).limit(1);
  if (!send || send.disabled) return notFound("Send not found");

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

  await db
    .update(sends)
    .set({ accessCount: send.accessCount + 1, updatedAt: new Date() })
    .where(eq(sends.uuid, send.uuid));

  // creatorIdentifier is the creator email unless hideEmail is set.
  let creatorIdentifier: string | null = null;
  if (!send.hideEmail) {
    const [owner] = await db.select().from(users).where(eq(users.uuid, send.userUuid)).limit(1);
    creatorIdentifier = owner?.email ?? null;
  }

  return jsonResponse(serializeSendAccess(send, creatorIdentifier));
}
