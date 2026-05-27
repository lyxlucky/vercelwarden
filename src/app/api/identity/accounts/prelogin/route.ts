import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildPreloginResponse, DEFAULT_KDF } from "@/lib/kdf";
import { jsonResponse, errorResponse } from "@/lib/responses";

// POST /identity/accounts/prelogin
// Same as /api/accounts/prelogin but at /identity path (some clients use this)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = body?.email?.toLowerCase().trim();

  if (!email) {
    return errorResponse("Email is required");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
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
