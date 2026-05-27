import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildPreloginResponse, DEFAULT_KDF } from "@/lib/kdf";
import { jsonResponse, errorResponse } from "@/lib/responses";

// POST /api/accounts/prelogin
// Returns KDF config for the given email (client uses this to derive master key)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = body?.email?.toLowerCase().trim();

  if (!email) {
    return errorResponse("Email is required");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    // Return default KDF for unknown users (don't leak whether user exists)
    return jsonResponse({
      kdf: DEFAULT_KDF.type,
      kdfIterations: DEFAULT_KDF.type === 1 ? DEFAULT_KDF.iterations : DEFAULT_KDF.pbkdf2Iterations,
      kdfMemory: DEFAULT_KDF.type === 1 ? DEFAULT_KDF.memory : null,
      kdfParallelism: DEFAULT_KDF.type === 1 ? DEFAULT_KDF.parallelism : null,
      kdfSalt: null,
      kdfSaltB64: null,
      Object: "prelogin",
    });
  }

  return jsonResponse(buildPreloginResponse(user));
}
