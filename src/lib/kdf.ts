// ─── KDF Types (client-side master key derivation) ────────
export enum KdfType {
  PBKDF2 = 0,
  Argon2id = 1,
}

// ─── Default KDF params for new registrations ─────────────
export const DEFAULT_KDF = {
  type: KdfType.Argon2id,
  iterations: 3,
  memory: 64,
  parallelism: 4,
  pbkdf2Iterations: 600000,
};

interface UserKdf {
  clientKdfType: number;
  clientKdfIter: number;
  clientKdfMemory: number | null;
  clientKdfParallelism: number | null;
}

export function buildPreloginResponse(user: UserKdf) {
  if (user.clientKdfType === KdfType.Argon2id) {
    return {
      kdf: 1,
      kdfIterations: user.clientKdfIter,
      kdfMemory: user.clientKdfMemory ?? DEFAULT_KDF.memory,
      kdfParallelism: user.clientKdfParallelism ?? DEFAULT_KDF.parallelism,
      kdfSalt: null,
      kdfSaltB64: null,
      Object: "prelogin",
    };
  }
  return {
    kdf: 0,
    kdfIterations: user.clientKdfIter,
    kdfMemory: null,
    kdfParallelism: null,
    kdfSalt: null,
    kdfSaltB64: null,
    Object: "prelogin",
  };
}

export function defaultPreloginResponse() {
  return {
    kdf: DEFAULT_KDF.type,
    kdfIterations: DEFAULT_KDF.iterations,
    kdfMemory: DEFAULT_KDF.memory,
    kdfParallelism: DEFAULT_KDF.parallelism,
    kdfSalt: null,
    kdfSaltB64: null,
    Object: "prelogin",
  };
}

// Build the body used in registration: returns the per-user KDF settings.
export function pickClientKdfFromBody(body: {
  kdfType?: number;
  kdf?: number;
  kdfIterations?: number;
  kdfMemory?: number;
  kdfParallelism?: number;
}) {
  const type = body.kdfType ?? body.kdf ?? DEFAULT_KDF.type;
  if (type === KdfType.Argon2id) {
    return {
      clientKdfType: KdfType.Argon2id,
      clientKdfIter: body.kdfIterations ?? DEFAULT_KDF.iterations,
      clientKdfMemory: body.kdfMemory ?? DEFAULT_KDF.memory,
      clientKdfParallelism: body.kdfParallelism ?? DEFAULT_KDF.parallelism,
    };
  }
  return {
    clientKdfType: KdfType.PBKDF2,
    clientKdfIter: body.kdfIterations ?? DEFAULT_KDF.pbkdf2Iterations,
    clientKdfMemory: null,
    clientKdfParallelism: null,
  };
}
