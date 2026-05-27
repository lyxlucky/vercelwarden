import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/lib/responses";

// POST /api/two-factor/recover — unauthenticated; disables 2FA when the
// recovery code matches. Body: { email, masterPasswordHash, recoveryCode }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.toLowerCase().trim();
  const recoveryCode = (body?.recoveryCode as string | undefined)?.replace(/\s+/g, "");
  if (!email || !recoveryCode) return errorResponse("Missing required fields");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.totpRecover) return errorResponse("Invalid recovery code");

  const a = Buffer.from(recoveryCode);
  const b = Buffer.from(user.totpRecover);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return errorResponse("Invalid recovery code");
  }

  await db
    .update(users)
    .set({ totpSecret: null, totpRecover: null, updatedAt: new Date() })
    .where(eq(users.uuid, user.uuid));

  return new Response(null, { status: 200 });
}
