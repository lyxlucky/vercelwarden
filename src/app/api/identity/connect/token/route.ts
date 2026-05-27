import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, devices } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { generateTokenPair, buildProfile, newUuid, verifyRefreshToken } from "@/lib/auth";
import { tokenResponse, errorResponse, unauthorized } from "@/lib/responses";

// POST /identity/connect/token
// Handles: password login, refresh_token, client_credentials (API key)
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const grantType = formData.get("grant_type") as string;

  if (grantType === "refresh_token") {
    return handleRefreshToken(formData);
  } else if (grantType === "password") {
    return handlePasswordLogin(formData);
  } else if (grantType === "client_credentials") {
    return handleApiKeyLogin(formData);
  }

  return errorResponse("Unsupported grant_type");
}

// ─── Password Login ───────────────────────────────────────
async function handlePasswordLogin(formData: FormData) {
  const email = (formData.get("username") as string)?.toLowerCase().trim();
  const password = formData.get("password") as string;
  const deviceIdentifier = formData.get("deviceIdentifier") as string;
  const deviceName = formData.get("deviceName") as string;
  const deviceType = formData.get("deviceType") as string;

  if (!email || !password || !deviceIdentifier) {
    return errorResponse("Missing required fields");
  }

  // Find user by email
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.enabled) {
    return unauthorized("Invalid email or password.");
  }

  // Verify password hash (client sends hash, we compare with stored hash)
  if (password !== Buffer.from(user.passwordHash as Uint8Array).toString()) {
    return unauthorized("Invalid email or password.");
  }

  // Find or create device
  const deviceTypeNum = parseInt(deviceType) || 0;
  let device: typeof devices.$inferSelect;

  const [existingDevice] = await db
    .select()
    .from(devices)
    .where(eq(devices.identifier, deviceIdentifier))
    .limit(1);

  if (existingDevice) {
    const now = new Date();
    await db
      .update(devices)
      .set({ updatedAt: now, name: deviceName || "Unknown Device" })
      .where(eq(devices.uuid, existingDevice.uuid));
    device = { ...existingDevice, updatedAt: now, name: deviceName || "Unknown Device" };
  } else {
    device = {
      uuid: newUuid(),
      userUuid: user.uuid,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: deviceName || "Unknown Device",
      type: deviceTypeNum,
      identifier: deviceIdentifier,
      refreshToken: "", // will be set below
      pushToken: null,
      accessTokenExpiration: null,
    };
    await db.insert(devices).values(device);
  }

  const { accessToken, refreshToken } = await generateTokenPair(user, device);

  // Store refresh token in device record for rotation validation
  await db
    .update(devices)
    .set({ refreshToken, updatedAt: new Date() })
    .where(eq(devices.uuid, device.uuid));

  const profile = buildProfile(user);

  return tokenResponse({
    accessToken,
    refreshToken,
    expiresIn: 3600,
    tokenType: "Bearer",
    user: profile,
    privateKey: user.privateKey,
    key: user.akey,
    masterPasswordPolicy: null,
  });
}

// ─── Refresh Token ────────────────────────────────────────
async function handleRefreshToken(formData: FormData) {
  const refreshTokenValue = formData.get("refresh_token") as string;
  const deviceIdentifier = formData.get("deviceIdentifier") as string;

  if (!refreshTokenValue) {
    return errorResponse("refresh_token is required");
  }

  // Verify the refresh token JWT and extract claims
  const claims = await verifyRefreshToken(refreshTokenValue);
  if (!claims) {
    return unauthorized("Invalid or expired refresh token.");
  }

  const userUuid = claims.sub;
  const deviceUuid = claims.device;

  // Find the device
  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.uuid, deviceUuid))
    .limit(1);

  if (!device || device.userUuid !== userUuid) {
    return unauthorized("Invalid refresh token.");
  }

  // Verify the refresh token matches what we stored (prevents token reuse after rotation)
  if (device.refreshToken !== refreshTokenValue) {
    // Token mismatch — possible token reuse attack, invalidate all tokens for this device
    return unauthorized("Refresh token has been revoked.");
  }

  // Find the user
  const [user] = await db.select().from(users).where(eq(users.uuid, userUuid)).limit(1);
  if (!user || !user.enabled) {
    return unauthorized("User not found or disabled.");
  }

  // Generate new token pair (rotation)
  const { accessToken, refreshToken: newRefreshToken } = await generateTokenPair(user, device);

  // Store new refresh token (rotation — old token is now invalid)
  await db
    .update(devices)
    .set({ refreshToken: newRefreshToken, updatedAt: new Date() })
    .where(eq(devices.uuid, device.uuid));

  const profile = buildProfile(user);

  return tokenResponse({
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 3600,
    tokenType: "Bearer",
    user: profile,
    privateKey: user.privateKey,
    key: user.akey,
    masterPasswordPolicy: null,
  });
}

// ─── API Key Login ────────────────────────────────────────
async function handleApiKeyLogin(formData: FormData) {
  // TODO: Implement API key login
  return errorResponse("API key login not yet implemented", 501);
}
