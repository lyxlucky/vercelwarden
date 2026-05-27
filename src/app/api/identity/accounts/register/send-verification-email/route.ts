import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, invitationCodes } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { errorResponse } from "@/lib/responses";
import { signRegistrationToken } from "@/lib/registration-token";

// POST /identity/accounts/register/send-verification-email
// No SMTP — we mirror Vaultwarden's "mail disabled" branch: return the
// verification token as a plain JSON string body so the Web Vault skips the
// "check your email" UI and goes straight to the password-entry step, which
// then calls /register/finish with the token.
//
// Response contract (matches Vaultwarden 1.36.0):
//   - mail disabled: 200 OK, body = JSON-encoded string (the token)
//   - mail enabled:  204 No Content
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

  // JSON-encoded string body — NOT an object wrapper.
  return new NextResponse(JSON.stringify(token), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
