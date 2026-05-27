import { SignJWT, jwtVerify } from "jose";
import { db } from "@/db";
import { users, devices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// ─── JWT_SECRET (lazy, hard-fail) ─────────────────────────
let _jwtSecret: Uint8Array | null = null;
function getJwtSecret(): Uint8Array {
  if (_jwtSecret) return _jwtSecret;
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "JWT_SECRET must be set and at least 32 characters (e.g. `openssl rand -hex 32`)"
    );
  }
  _jwtSecret = new TextEncoder().encode(s);
  return _jwtSecret;
}

// ─── Types ────────────────────────────────────────────────
export interface AuthUser {
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
}

export interface AuthResult {
  user: typeof users.$inferSelect;
  device: typeof devices.$inferSelect;
}

// ─── Token Generation ─────────────────────────────────────
export async function generateTokenPair(
  user: typeof users.$inferSelect,
  device: typeof devices.$inferSelect
) {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);

  const accessToken = await new SignJWT({
    sub: user.uuid,
    device: device.uuid,
    email: user.email,
    name: user.name,
    premium: true,
    email_verified: !!user.verifiedAt,
    sstamp: user.securityStamp,
    iss: "Bitwarden",
    aud: "Bitwarden",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime("1h")
    .setIssuer("Bitwarden")
    .setAudience("Bitwarden")
    .sign(secret);

  const refreshToken = await new SignJWT({
    sub: user.uuid,
    device: device.uuid,
    grant_type: "refresh_token",
    iss: "Bitwarden",
    aud: "Bitwarden",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime("30d")
    .setIssuer("Bitwarden")
    .setAudience("Bitwarden")
    .sign(secret);

  return { accessToken, refreshToken };
}

// ─── Verify & Extract User from Bearer Token ──────────────
export async function verifyAuth(authHeader: string | null): Promise<AuthResult | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: "Bitwarden",
      audience: "Bitwarden",
    });

    const userUuid = payload.sub as string;
    const deviceUuid = payload.device as string;
    const tokenSstamp = payload.sstamp as string | undefined;

    const [user] = await db.select().from(users).where(eq(users.uuid, userUuid)).limit(1);
    if (!user || !user.enabled) return null;

    // Security stamp rotation invalidates outstanding access tokens.
    if (tokenSstamp && tokenSstamp !== user.securityStamp) return null;

    const [device] = await db.select().from(devices).where(eq(devices.uuid, deviceUuid)).limit(1);
    if (!device || device.userUuid !== user.uuid) return null;

    return { user, device };
  } catch {
    return null;
  }
}

// ─── Build Bitwarden-compatible profile response ──────────
export function buildProfile(user: typeof users.$inferSelect): AuthUser {
  return {
    uuid: user.uuid,
    email: user.email,
    name: user.name,
    emailVerified: !!user.verifiedAt,
    premium: true,
    masterPasswordHint: user.passwordHint,
    culture: "en-US",
    twoFactorEnabled: !!user.totpSecret,
    key: user.akey,
    privateKey: user.privateKey,
    securityStamp: user.securityStamp,
    forcePasswordReset: false,
    avatarColor: user.avatarColor,
    creationDate: user.createdAt.toISOString(),
  };
}

// ─── Generate UUID ────────────────────────────────────────
export function newUuid(): string {
  return uuidv4();
}

// ─── Verify Refresh Token ─────────────────────────────────
export async function verifyRefreshToken(
  token: string
): Promise<{ sub: string; device: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: "Bitwarden",
      audience: "Bitwarden",
    });
    if (payload.grant_type !== "refresh_token") return null;
    return { sub: payload.sub as string, device: payload.device as string };
  } catch {
    return null;
  }
}
