import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, devices } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  generateTokenPair,
  newUuid,
  verifyRefreshToken,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import {
  tokenResponse,
  errorResponse,
  unauthorized,
} from "@/lib/responses";

// POST /identity/connect/token
// Handles: password grant, refresh_token grant, client_credentials (API key)
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const grantType = formData.get("grant_type") as string | null;

  switch (grantType) {
    case "password":
      return handlePasswordLogin(formData);
    case "refresh_token":
      return handleRefreshToken(formData);
    case "client_credentials":
      return handleApiKeyLogin();
    default:
      return errorResponse("Unsupported grant_type");
  }
}

// ─── Password Login ───────────────────────────────────────
async function handlePasswordLogin(formData: FormData) {
  const email = (formData.get("username") as string | null)?.toLowerCase().trim();
  const password = formData.get("password") as string | null;
  const deviceIdentifier = formData.get("deviceIdentifier") as string | null;
  const deviceName = (formData.get("deviceName") as string | null) || "Unknown Device";
  const deviceTypeRaw = formData.get("deviceType") as string | null;

  if (!email || !password || !deviceIdentifier) {
    return errorResponse("Missing required fields");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.enabled) {
    return unauthorized("Username or password is incorrect. Try again.");
  }

  const ok = verifyPassword(
    password,
    user.passwordHash as Uint8Array,
    user.salt as Uint8Array,
    user.passwordIterations
  );
  if (!ok) {
    return unauthorized("Username or password is incorrect. Try again.");
  }

  // 2FA gate (TOTP only for now)
  if (user.totpSecret) {
    const twoFactorToken = formData.get("twoFactorToken") as string | null;
    if (!twoFactorToken) {
      // Bitwarden clients recognize this exact response and prompt for code.
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Two factor required.",
          TwoFactorProviders: [0],
          TwoFactorProviders2: { "0": null },
          MasterPasswordPolicy: null,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { verifyTotp } = await import("@/lib/totp");
    if (!verifyTotp(user.totpSecret, twoFactorToken)) {
      return unauthorized("Two-factor code is invalid");
    }
  }

  const deviceTypeNum = deviceTypeRaw ? parseInt(deviceTypeRaw) || 0 : 0;
  let device: typeof devices.$inferSelect;

  const [existingDevice] = await db
    .select()
    .from(devices)
    .where(eq(devices.identifier, deviceIdentifier))
    .limit(1);

  const now = new Date();
  if (existingDevice) {
    await db
      .update(devices)
      .set({ updatedAt: now, name: deviceName })
      .where(eq(devices.uuid, existingDevice.uuid));
    device = { ...existingDevice, updatedAt: now, name: deviceName };
  } else {
    device = {
      uuid: newUuid(),
      userUuid: user.uuid,
      createdAt: now,
      updatedAt: now,
      name: deviceName,
      type: deviceTypeNum,
      identifier: deviceIdentifier,
      refreshToken: "",
      pushToken: null,
      accessTokenExpiration: null,
    };
    await db.insert(devices).values(device);
  }

  const { accessToken, refreshToken } = await generateTokenPair(user, device);

  await db
    .update(devices)
    .set({ refreshToken, updatedAt: new Date() })
    .where(eq(devices.uuid, device.uuid));

  return tokenResponse({
    accessToken,
    refreshToken,
    expiresIn: 3600,
    tokenType: "Bearer",
    user,
    masterPasswordPolicy: null,
  });
}

// ─── Refresh Token ────────────────────────────────────────
async function handleRefreshToken(formData: FormData) {
  const refreshTokenValue = formData.get("refresh_token") as string | null;
  if (!refreshTokenValue) return errorResponse("refresh_token is required");

  const claims = await verifyRefreshToken(refreshTokenValue);
  if (!claims) return unauthorized("Invalid or expired refresh token.");

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.uuid, claims.device))
    .limit(1);
  if (!device || device.userUuid !== claims.sub) {
    return unauthorized("Invalid refresh token.");
  }
  if (device.refreshToken !== refreshTokenValue) {
    return unauthorized("Refresh token has been revoked.");
  }

  const [user] = await db.select().from(users).where(eq(users.uuid, claims.sub)).limit(1);
  if (!user || !user.enabled) return unauthorized("User not found or disabled.");

  const { accessToken, refreshToken: newRefreshToken } = await generateTokenPair(user, device);

  await db
    .update(devices)
    .set({ refreshToken: newRefreshToken, updatedAt: new Date() })
    .where(eq(devices.uuid, device.uuid));

  return tokenResponse({
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 3600,
    tokenType: "Bearer",
    user,
    masterPasswordPolicy: null,
  });
}

// ─── API Key Login (not implemented) ──────────────────────
async function handleApiKeyLogin() {
  return errorResponse("API key login not yet implemented", 501);
}
