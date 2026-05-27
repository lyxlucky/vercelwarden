import { db } from "@/db";
import { users, invitationCodes } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { newUuid } from "@/lib/auth";
import { pickClientKdfFromBody } from "@/lib/kdf";
import {
  hashPassword,
  newSalt,
  DEFAULT_SERVER_PBKDF2_ITER,
} from "@/lib/password";

export interface RegisterInput {
  email: string;
  masterPasswordHash: string;
  masterPasswordHint?: string | null;
  name?: string;
  key: string;
  privateKey?: string | null;
  publicKey?: string | null;
  token?: string;
  kdfType?: number;
  kdf?: number;
  kdfIterations?: number;
  kdfMemory?: number;
  kdfParallelism?: number;
}

export type RegisterError =
  | { kind: "missing_fields" }
  | { kind: "invite_required" }
  | { kind: "invite_invalid" }
  | { kind: "email_taken" };

export type RegisterResult =
  | { ok: true; user: typeof users.$inferSelect }
  | { ok: false; error: RegisterError };

export async function createUser(input: RegisterInput): Promise<RegisterResult> {
  const email = input.email?.toLowerCase().trim();
  if (!email || !input.masterPasswordHash || !input.key) {
    return { ok: false, error: { kind: "missing_fields" } };
  }

  const requireInvite = process.env.REQUIRE_INVITE_CODE === "true";
  if (requireInvite) {
    if (!input.token) return { ok: false, error: { kind: "invite_required" } };
    const [invite] = await db
      .select()
      .from(invitationCodes)
      .where(
        and(eq(invitationCodes.code, input.token), isNull(invitationCodes.usedAt))
      )
      .limit(1);
    if (!invite) return { ok: false, error: { kind: "invite_invalid" } };

    await db
      .update(invitationCodes)
      .set({ usedAt: new Date(), usedBy: email })
      .where(eq(invitationCodes.code, input.token));
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { ok: false, error: { kind: "email_taken" } };

  const userId = newUuid();
  const now = new Date();
  const salt = newSalt();
  const passwordHash = hashPassword(input.masterPasswordHash, salt);
  const kdf = pickClientKdfFromBody(input);

  await db.insert(users).values({
    uuid: userId,
    createdAt: now,
    updatedAt: now,
    email,
    name: input.name ?? "",
    passwordHash,
    salt,
    passwordIterations: DEFAULT_SERVER_PBKDF2_ITER,
    passwordHint: input.masterPasswordHint ?? null,
    akey: input.key,
    privateKey: input.privateKey ?? null,
    publicKey: input.publicKey ?? null,
    ...kdf,
    securityStamp: newUuid(),
    equivalentDomains: "[]",
    excludedGlobals: "[]",
    enabled: true,
  });

  const [user] = await db.select().from(users).where(eq(users.uuid, userId)).limit(1);
  return { ok: true, user: user! };
}
