import { NextResponse } from "next/server";
import type { AuthUser } from "./auth";

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

// ─── Bitwarden identity token response ────────────────────
// Field names match the Bitwarden client expectations exactly
// (PascalCase for protocol fields, lowercase for OAuth standard fields).
export function tokenResponse(params: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: AuthUser;
  masterPasswordPolicy: unknown;
}) {
  const { user } = params;
  return NextResponse.json({
    // OAuth standard fields (lowercase)
    access_token: params.accessToken,
    expires_in: params.expiresIn,
    token_type: params.tokenType,
    refresh_token: params.refreshToken,
    scope: "api offline_access",

    // Bitwarden protocol fields (PascalCase)
    Key: user.key,
    PrivateKey: user.privateKey,
    Kdf: undefined as number | undefined, // populated by caller if needed
    KdfIterations: undefined as number | undefined,
    KdfMemory: undefined as number | undefined,
    KdfParallelism: undefined as number | undefined,
    ResetMasterPassword: false,
    ForcePasswordReset: user.forcePasswordReset,
    MasterPasswordPolicy: params.masterPasswordPolicy,
    UserDecryptionOptions: {
      HasMasterPassword: true,
      Object: "userDecryptionOptions",
    },

    // Profile mirror (Bitwarden also expects these at top level)
    Uuid: user.uuid,
    Email: user.email,
    Name: user.name,
    EmailVerified: user.emailVerified,
    Premium: user.premium,
    MasterPasswordHint: user.masterPasswordHint,
    Culture: user.culture,
    TwoFactorEnabled: user.twoFactorEnabled,
    SecurityStamp: user.securityStamp,
    AvatarColor: user.avatarColor,
    CreationDate: user.creationDate,
    UnofficialServer: null,
  });
}
