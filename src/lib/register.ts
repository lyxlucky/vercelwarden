import { db } from "@/db";
import { adminInvites, users } from "@/db/schema";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { newUuid } from "@/lib/auth";
import { pickClientKdfFromBody } from "@/lib/kdf";
import {
  hashPassword,
  newSalt,
  DEFAULT_SERVER_PBKDF2_ITER,
} from "@/lib/password";
import { evaluateRegistrationPolicy } from "@/lib/server/auth/registration-policy";
import { verifySecret } from "@/lib/server/auth/secret-hash";

export interface RegisterInput {
  email: string;
  masterPasswordHash: string;
  masterPasswordHint?: string | null;
  name?: string;
  key: string;
  privateKey?: string | null;
  publicKey?: string | null;
  kdfType?: number;
  kdf?: number;
  kdfIterations?: number;
  kdfMemory?: number;
  kdfParallelism?: number;
  invitationCode?: string | null;
}

export type RegisterError =
  | { kind: "missing_fields" }
  | { kind: "registration_disabled" }
  | { kind: "email_taken" };

export type RegisterResult =
  | { ok: true; user: typeof users.$inferSelect }
  | { ok: false; error: RegisterError };

export async function createUser(input: RegisterInput): Promise<RegisterResult> {
  const email = input.email?.normalize("NFKC").toLowerCase().trim();
  if (!email || !input.masterPasswordHash || !input.key) {
    return { ok: false, error: { kind: "missing_fields" } };
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const inviteRequired = process.env.REQUIRE_INVITE === "true";
    let matchedInvite: typeof adminInvites.$inferSelect | undefined;
    if (inviteRequired && input.invitationCode) {
      const candidates = await tx
        .select()
        .from(adminInvites)
        .where(and(
          eq(adminInvites.email, email),
          isNull(adminInvites.revokedAt),
          gt(adminInvites.expiresAt, now),
          lt(adminInvites.useCount, adminInvites.maxUses)
        ));
      for (const candidate of candidates) {
        if (await verifySecret(input.invitationCode, candidate.codeHash, "admin-invite")) {
          matchedInvite = candidate;
          break;
        }
      }
    }

    const policy = evaluateRegistrationPolicy({
      enabled: process.env.DISABLE_REGISTRATION !== "true",
      inviteRequired,
      inviteValid: Boolean(matchedInvite),
    });
    if (!policy.allowed) return { ok: false, error: { kind: "registration_disabled" } } as const;

    const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) return { ok: false, error: { kind: "email_taken" } } as const;

    const userId = newUuid();
    const salt = newSalt();
    const passwordHash = hashPassword(input.masterPasswordHash, salt);
    const kdf = pickClientKdfFromBody(input);
    await tx.insert(users).values({
      uuid: userId,
      createdAt: now,
      updatedAt: now,
      email,
      name: input.name?.trim().slice(0, 100) ?? "",
      passwordHash,
      salt,
      passwordIterations: DEFAULT_SERVER_PBKDF2_ITER,
      passwordHint: input.masterPasswordHint?.slice(0, 200) ?? null,
      akey: input.key,
      privateKey: input.privateKey ?? null,
      publicKey: input.publicKey ?? null,
      ...kdf,
      securityStamp: newUuid(),
      equivalentDomains: "[]",
      excludedGlobals: "[]",
      enabled: true,
    });
    if (matchedInvite) {
      const useCount = matchedInvite.useCount + 1;
      await tx.update(adminInvites).set({
        useCount,
        lastUsedAt: now,
        usedAt: useCount >= matchedInvite.maxUses ? now : null,
      }).where(eq(adminInvites.uuid, matchedInvite.uuid));
    }
    const [user] = await tx.select().from(users).where(eq(users.uuid, userId)).limit(1);
    return { ok: true, user: user! } as const;
  });
}
