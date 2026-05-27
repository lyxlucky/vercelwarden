import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, invitationCodes } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { buildProfile, newUuid } from "@/lib/auth";
import { DEFAULT_KDF } from "@/lib/kdf";
import { jsonResponse, errorResponse } from "@/lib/responses";

// POST /api/accounts/register
// Register a new user (requires invitation code if REQUIRE_INVITE_CODE=true)
export async function POST(request: NextRequest) {
  const body = await request.json();

  const email = body?.email?.toLowerCase().trim();
  const masterPasswordHash = body?.masterPasswordHash;
  const masterPasswordHint = body?.masterPasswordHint || null;
  const name = body?.name || "";
  const key = body?.key;              // encrypted symmetric key
  const privateKey = body?.privateKey; // encrypted RSA private key
  const publicKey = body?.publicKey;   // RSA public key
  const token = body?.token;           // invitation code (if required)

  if (!email || !masterPasswordHash || !key) {
    return errorResponse("Missing required fields");
  }

  // Check if invitation code is required
  const requireInvite = process.env.REQUIRE_INVITE_CODE === "true";
  if (requireInvite) {
    if (!token) {
      return errorResponse("Invitation code is required", 400, {
        token: ["Invitation code is required"],
      });
    }

    // Validate invitation code
    const [invite] = await db
      .select()
      .from(invitationCodes)
      .where(and(eq(invitationCodes.code, token), isNull(invitationCodes.usedAt)))
      .limit(1);

    if (!invite) {
      return errorResponse("Invalid or expired invitation code", 400, {
        token: ["Invalid or expired invitation code"],
      });
    }

    // Mark invitation code as used
    await db
      .update(invitationCodes)
      .set({ usedAt: new Date(), usedBy: email })
      .where(eq(invitationCodes.code, token));
  }

  // Check if email already registered
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return errorResponse("Email is already registered", 400, {
      email: ["Email is already registered"],
    });
  }

  // Create user
  const userId = newUuid();
  const now = new Date();

  await db.insert(users).values({
    uuid: userId,
    createdAt: now,
    updatedAt: now,
    email,
    name,
    passwordHash: Buffer.from(masterPasswordHash),
    salt: Buffer.from(""), // salt is handled client-side in new Bitwarden protocol
    passwordIterations: DEFAULT_KDF.type === 1 ? DEFAULT_KDF.iterations : DEFAULT_KDF.pbkdf2Iterations,
    passwordHint: masterPasswordHint,
    akey: key,
    privateKey: privateKey || null,
    publicKey: publicKey || null,
    clientKdfType: body?.kdfType ?? DEFAULT_KDF.type,
    clientKdfIter: body?.kdfIterations ?? (DEFAULT_KDF.type === 1 ? DEFAULT_KDF.iterations : DEFAULT_KDF.pbkdf2Iterations),
    clientKdfMemory: body?.kdfMemory ?? DEFAULT_KDF.memory,
    clientKdfParallelism: body?.kdfParallelism ?? DEFAULT_KDF.parallelism,
    securityStamp: newUuid(),
    equivalentDomains: "[]",
    excludedGlobals: "[]",
    enabled: true,
  });

  // Fetch created user and return profile
  const [user] = await db.select().from(users).where(eq(users.uuid, userId)).limit(1);
  const profile = buildProfile(user!);

  return jsonResponse(profile, 200);
}
