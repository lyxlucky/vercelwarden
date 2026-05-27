// ─── KDF Types (matches Vaultwarden / Bitwarden client) ───
export enum KdfType {
  PBKDF2 = 0,
  Argon2id = 1,
}

// ─── Default KDF params for registration ──────────────────
export const DEFAULT_KDF = {
  type: KdfType.Argon2id,
  iterations: 3,          // Argon2 iterations (not PBKDF2 iterations)
  memory: 64,             // Argon2 memory in MB
  parallelism: 4,         // Argon2 parallelism
  pbkdf2Iterations: 600000, // PBKDF2 iterations if used
};

// ─── Build prelogin response (matches Vaultwarden) ────────
export function buildPreloginResponse(user: {
  clientKdfType: number;
  clientKdfIter: number;
  clientKdfMemory: number | null;
  clientKdfParallelism: number | null;
}) {
  if (user.clientKdfType === KdfType.Argon2id) {
    return {
      kdf: 1, // Argon2id
      kdfIterations: user.clientKdfIter,
      kdfMemory: user.clientKdfMemory ?? 64,
      kdfParallelism: user.clientKdfParallelism ?? 4,
      kdfSalt: null, // Not used in new protocol
      kdfSaltB64: null,
      Object: "prelogin",
    };
  } else {
    return {
      kdf: 0, // PBKDF2
      kdfIterations: user.clientKdfIter,
      kdfMemory: null,
      kdfParallelism: null,
      kdfSalt: null,
      kdfSaltB64: null,
      Object: "prelogin",
    };
  }
}
