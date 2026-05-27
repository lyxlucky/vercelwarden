import { NextResponse } from "next/server";

// ─── Bitwarden-compatible error responses ─────────────────
export function errorResponse(message: string, status = 400, validationErrors?: Record<string, string[]>) {
  const body: Record<string, unknown> = {
    message,
    validationErrors: validationErrors || {},
    object: "error",
  };
  return NextResponse.json(body, { status });
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

// ─── Bitwarden identity token response format ─────────────
export function tokenResponse(params: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: {
    uuid: string;
    email: string;
    name: string;
    emailVerified: boolean;
    premium: boolean;
    masterPasswordHint: string | null;
    culture: string;
    twoFactorEnabled: boolean;
    key: string;
    privateKey: string | null;
    securityStamp: string;
    forcePasswordReset: boolean;
    avatarColor: string | null;
    creationDate: string;
  };
  privateKey: string | null;
  key: string;
  masterPasswordPolicy: null;
}) {
  return NextResponse.json({
    access_token: params.accessToken,
    expires_in: params.expiresIn,
    token_type: params.tokenType,
    refresh_token: params.refreshToken,
    Key: params.user.key,
    PrivateKey: params.privateKey,
    MasterPasswordPolicy: params.masterPasswordPolicy,
    ForcePasswordReset: params.user.forcePasswordReset,
    scope: "api offline_access",
    unofficialServer: null,
    UserDecryptionOptions: {
      HasMasterPassword: true,
      Object: "userDecryptionOptions",
    },
    ...params.user,
  });
}
