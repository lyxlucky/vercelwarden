import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildPreloginResponse, defaultPreloginResponse } from "@/lib/kdf";
import { jsonResponse, errorResponse } from "@/lib/responses";

// Shared handler for /api/accounts/prelogin, /identity/accounts/prelogin and
// the newer /identity/accounts/prelogin/password (Bitwarden client 2026.4+).
// All three are identical per Vaultwarden 1.36.0 — they return the user's KDF
// settings, or defaults if the email is unknown (so we don't leak existence).
export async function handlePrelogin(body: unknown) {
  const email = (body as { email?: string } | null)?.email?.toLowerCase().trim();
  if (!email) return errorResponse("Email is required");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return jsonResponse(user ? buildPreloginResponse(user) : defaultPreloginResponse());
}
