import { NextResponse } from "next/server";
import type { users } from "@/db/schema";

// ─── Bitwarden-compatible error responses ─────────────────
export function errorResponse(
  message: string,
  status = 400,
  validationErrors?: Record<string, string[]>
) {
  return NextResponse.json(
    {
      message,
      validationErrors: validationErrors ?? {},
      object: "error",
    },
    { status }
  );
}

export function unauthorized(message = "Unauthorized.") {
  return errorResponse(message, 401);
}

export function notFound(message = "Not found.") {
  return errorResponse(message, 404);
}

// ─── Bitwarden-compatible success responses ───────────────
export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// ─── Bitwarden identity token response (Vaultwarden 1.36.0) ──────
// Wire format is mostly PascalCase per Vaultwarden identity.rs:533-554.
// Note: the AccountKeys.publicKeyEncryptionKeyPair inner object uses camelCase
// (wrappedPrivateKey, publicKey) — this is upstream's own inconsistency.
// All four top-level Kdf fields and the UserDecryptionOptions wrapper MUST be
// present or new clients crash with `toWrappedAccountCryptographicState` null.
export function tokenResponse(params: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: typeof users.$inferSelect;
  masterPasswordPolicy: unknown;
  twoFactorToken?: string | null;
}) {
  const { user } = params;
  const akey = user.akey ?? "";
  const passwordHashLen = (user.passwordHash as Uint8Array | null)?.length ?? 0;
  const hasMasterPassword = passwordHashLen > 0;

  const masterPasswordUnlock = hasMasterPassword
    ? {
        Kdf: {
          KdfType: user.clientKdfType,
          Iterations: user.clientKdfIter,
          Memory: user.clientKdfMemory,
          Parallelism: user.clientKdfParallelism,
        },
        // Upstream emits both spellings; we mirror that.
        MasterKeyEncryptedUserKey: akey,
        MasterKeyWrappedUserKey: akey,
        Salt: user.email,
      }
    : null;

  const accountKeys = user.privateKey
    ? {
        publicKeyEncryptionKeyPair: {
          wrappedPrivateKey: user.privateKey,
          publicKey: user.publicKey,
          Object: "publicKeyEncryptionKeyPair",
        },
        Object: "privateKeys",
      }
    : null;

  const body: Record<string, unknown> = {
    // OAuth standard fields (lowercase)
    access_token: params.accessToken,
    expires_in: params.expiresIn,
    token_type: params.tokenType,
    refresh_token: params.refreshToken,
    scope: "api offline_access",

    // Bitwarden protocol fields (PascalCase)
    PrivateKey: user.privateKey,
    Kdf: user.clientKdfType,
    KdfIterations: user.clientKdfIter,
    KdfMemory: user.clientKdfMemory,
    KdfParallelism: user.clientKdfParallelism,
    ResetMasterPassword: false,
    ForcePasswordReset: false,
    MasterPasswordPolicy: params.masterPasswordPolicy,
    AccountKeys: accountKeys,
    UserDecryptionOptions: {
      HasMasterPassword: hasMasterPassword,
      MasterPasswordUnlock: masterPasswordUnlock,
      Object: "userDecryptionOptions",
    },
  };

  if (akey) body.Key = akey;
  if (params.twoFactorToken) body.TwoFactorToken = params.twoFactorToken;

  return NextResponse.json(body);
}
