import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, invitationCodes } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { jsonResponse, errorResponse } from "@/lib/responses";
import { signRegistrationToken } from "@/lib/registration-token";

// POST /identity/accounts/register/send-verification-email
// We do not actually send email (no SMTP). The token is returned in-band so
// the client can complete /register/finish immediately. With invite-code mode
// on, the caller must still pass a valid invite token at /register/finish.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse("Invalid JSON body");

  const email = body?.email?.toLowerCase().trim();
  const name = body?.name || "";
  if (!email) return errorResponse("Email is required");

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return errorResponse("Email is already registered");

  if (process.env.REQUIRE_INVITE_CODE === "true") {
    const [invite] = await db
      .select()
      .from(invitationCodes)
      .where(and(isNull(invitationCodes.usedAt)))
      .limit(1);
    if (!invite) {
      return errorResponse("Registration disabled: no invitation codes available");
    }
  }

  const token = await signRegistrationToken({ email, name });

  return jsonResponse({
    object: "send-verification-email",
    emailVerificationToken: token,
  });
}
