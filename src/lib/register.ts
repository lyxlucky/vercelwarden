import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
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
  kdfType?: number;
  kdf?: number;
  kdfIterations?: number;
  kdfMemory?: number;
  kdfParallelism?: number;
}

export type RegisterError =
  | { kind: "missing_fields" }
  | { kind: "registration_disabled" }
  | { kind: "email_taken" };

export type RegisterResult =
  | { ok: true; user: typeof users.$inferSelect }
  | { ok: false; error: RegisterError };

export async function createUser(input: RegisterInput): Promise<RegisterResult> {
  const email = input.email?.toLowerCase().trim();
  if (!email || !input.masterPasswordHash || !input.key) {
    return { ok: false, error: { kind: "missing_fields" } };
  }

  if (process.env.DISABLE_REGISTRATION === "true") {
    return { ok: false, error: { kind: "registration_disabled" } };
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
