import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, invitationCodes } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { newUuid } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/responses";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "change-me");

// POST /identity/accounts/register/send-verification-email
export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = body?.email?.toLowerCase().trim();
  const name = body?.name || "";

  if (!email) return errorResponse("Email is required");

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return errorResponse("Email is already registered");

  const requireInvite = process.env.REQUIRE_INVITE_CODE === "true";
  if (requireInvite) {
    const [invite] = await db.select().from(invitationCodes)
      .where(and(isNull(invitationCodes.usedAt))).limit(1);
    if (!invite) return errorResponse("No valid invitation codes available");
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ email, name, purpose: "registration" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime("15m")
    .sign(JWT_SECRET);

  return jsonResponse({ Object: "send-verification-email", emailVerificationToken: token });
}
