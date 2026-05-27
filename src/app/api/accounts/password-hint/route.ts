import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, errorResponse } from "@/lib/responses";

// POST /api/accounts/password-hint — always 200; never reveal whether the
// email is registered. If a hint exists we return it; otherwise empty string.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.toLowerCase().trim();
  if (!email) return errorResponse("Email is required");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return jsonResponse({
    MasterPasswordHint: user?.passwordHint ?? "",
    Object: "password-hint",
  });
}
