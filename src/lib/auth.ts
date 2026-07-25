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
    role: user.role,
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
// Logs the *reason* for every rejection at info level so 401s are diagnosable
// in Vercel logs. The wire response stays opaque ("401") but the cause is
// recoverable from runtime logs instead of guessing.
export async function verifyAuth(authHeader: string | null): Promise<AuthResult | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    if (authHeader) console.info("verifyAuth: missing Bearer prefix");
    return null;
  }

  const token = authHeader.slice(7);
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, getJwtSecret(), {
      issuer: "Bitwarden",
      audience: "Bitwarden",
    });
    payload = result.payload as Record<string, unknown>;
  } catch (e) {
    console.info(
      "verifyAuth: jwtVerify failed:",
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }

  const userUuid = payload.sub as string;
  const deviceUuid = payload.device as string;
  const tokenSstamp = payload.sstamp as string | undefined;

  const [user] = await db.select().from(users).where(eq(users.uuid, userUuid)).limit(1);
  if (!user) {
    console.info(`verifyAuth: user ${userUuid} not found`);
    return null;
  }
  if (!user.enabled) {
    console.info(`verifyAuth: user ${userUuid} is disabled`);
    return null;
  }

  if (tokenSstamp && tokenSstamp !== user.securityStamp) {
    console.info(
      `verifyAuth: sstamp mismatch for ${userUuid} (token=${tokenSstamp} db=${user.securityStamp})`
    );
    return null;
  }

  const [device] = await db.select().from(devices).where(eq(devices.uuid, deviceUuid)).limit(1);
  if (!device) {
    console.info(`verifyAuth: device ${deviceUuid} not found`);
    return null;
  }
  if (device.revokedAt) {
    console.info(`verifyAuth: device ${deviceUuid} is revoked`);
    return null;
  }
  if (device.userUuid !== user.uuid) {
    console.info(
      `verifyAuth: device ${deviceUuid} belongs to ${device.userUuid}, not ${user.uuid}`
    );
    return null;
  }

  return { user, device };
}

// ─── Build Bitwarden-compatible profile response (Vaultwarden 1.36.0) ──
// Wire format is fully camelCase. Field set matches User::to_json in
// db/models/user.rs so newer Bitwarden clients can parse it.
export function buildProfile(user: typeof users.$inferSelect) {
  const status = (user.passwordHash as Uint8Array).length === 0 ? 0 : 2; // Invited=0, Enabled=2
  return {
    _status: status,
    id: user.uuid,
    name: user.name,
    email: user.email,
    emailVerified: !!user.verifiedAt,
    premium: true,
    premiumFromOrganization: false,
    masterPasswordHint: user.passwordHint,
    culture: "en-US",
    twoFactorEnabled: !!user.totpSecret,
    key: user.akey,
    privateKey: user.privateKey,
    securityStamp: user.securityStamp,
    organizations: [] as unknown[],
    providers: [] as unknown[],
    providerOrganizations: [] as unknown[],
    forcePasswordReset: false,
    avatarColor: user.avatarColor,
    usesKeyConnector: false,
    creationDate: user.createdAt.toISOString(),
    object: "profile",
  };
}

export type ProfileResponse = ReturnType<typeof buildProfile>;

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
