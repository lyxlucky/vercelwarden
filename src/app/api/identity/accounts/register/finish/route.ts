import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, invitationCodes } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { jwtVerify } from "jose";
import { buildProfile, newUuid } from "@/lib/auth";
import { DEFAULT_KDF } from "@/lib/kdf";
import { jsonResponse, errorResponse } from "@/lib/responses";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "change-me");

// POST /identity/accounts/register/finish
export async function POST(request: NextRequest) {
  const body = await request.json();
  const token = body?.emailVerificationToken;
  const masterPasswordHash = body?.masterPasswordHash;
  const masterPasswordHint = body?.masterPasswordHint || null;
  const key = body?.key;
  const privateKey = body?.privateKey;
  const publicKey = body?.publicKey;
  const inviteToken = body?.token;

  if (!token || !masterPasswordHash || !key) {
    return errorResponse("Missing required fields");
  }

  let email: string;
  let name: string;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.purpose !== "registration") return errorResponse("Invalid token purpose");
    email = payload.email as string;
    name = (payload.name as string) || "";
  } catch {
    return errorResponse("Invalid or expired verification token");
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return errorResponse("Email is already registered");

  const requireInvite = process.env.REQUIRE_INVITE_CODE === "true";
  if (requireInvite) {
    if (!inviteToken) return errorResponse("Invitation code is required");
    const [invite] = await db.select().from(invitationCodes)
      .where(and(eq(invitationCodes.code, inviteToken), isNull(invitationCodes.usedAt))).limit(1);
    if (!invite) return errorResponse("Invalid or expired invitation code");
    await db.update(invitationCodes).set({ usedAt: new Date(), usedBy: email })
      .where(eq(invitationCodes.code, inviteToken));
  }

  const userId = newUuid();
  const now = new Date();
  await db.insert(users).values({
    uuid: userId, createdAt: now, updatedAt: now, email, name,
    passwordHash: Buffer.from(masterPasswordHash), salt: Buffer.from(""),
    passwordIterations: DEFAULT_KDF.type === 1 ? DEFAULT_KDF.iterations : DEFAULT_KDF.pbkdf2Iterations,
    passwordHint: masterPasswordHint, akey: key,
    privateKey: privateKey || null, publicKey: publicKey || null,
    clientKdfType: body?.kdfType ?? DEFAULT_KDF.type,
    clientKdfIter: body?.kdfIterations ?? (DEFAULT_KDF.type === 1 ? DEFAULT_KDF.iterations : DEFAULT_KDF.pbkdf2Iterations),
    clientKdfMemory: body?.kdfMemory ?? DEFAULT_KDF.memory,
    clientKdfParallelism: body?.kdfParallelism ?? DEFAULT_KDF.parallelism,
    securityStamp: newUuid(), equivalentDomains: "[]", excludedGlobals: "[]", enabled: true,
  });

  const [user] = await db.select().from(users).where(eq(users.uuid, userId)).limit(1);
  return jsonResponse(buildProfile(user!));
}
