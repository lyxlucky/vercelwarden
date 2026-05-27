import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

// ─── Server-side password hashing ─────────────────────────
// The client already does Argon2id/PBKDF2 over the master password to derive
// `masterPasswordHash`. The server applies a second round of PBKDF2 with a
// random salt before storing — mirrors Vaultwarden's `users.password_hash`
// design so a DB leak does not yield directly usable login material.

const SERVER_PBKDF2_ITER = 100000;
const SERVER_SALT_BYTES = 16;
const SERVER_HASH_BYTES = 32;
const SERVER_HASH_DIGEST = "sha256" as const;

export function newSalt(): Buffer {
  return randomBytes(SERVER_SALT_BYTES);
}

export function hashPassword(
  clientMasterPasswordHash: string,
  salt: Buffer,
  iterations: number = SERVER_PBKDF2_ITER
): Buffer {
  return pbkdf2Sync(
    clientMasterPasswordHash,
    salt,
    iterations,
    SERVER_HASH_BYTES,
    SERVER_HASH_DIGEST
  );
}

export function verifyPassword(
  clientMasterPasswordHash: string,
  storedHash: Uint8Array,
  storedSalt: Uint8Array,
  iterations: number
): boolean {
  const candidate = hashPassword(
    clientMasterPasswordHash,
    Buffer.from(storedSalt),
    iterations
  );
  const stored = Buffer.from(storedHash);
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export const DEFAULT_SERVER_PBKDF2_ITER = SERVER_PBKDF2_ITER;
