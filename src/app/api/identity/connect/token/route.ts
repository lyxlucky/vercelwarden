import { NextRequest } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { accountPasskeys, devices, twoFactorCredentials, users } from "@/db/schema";
import { generateTokenPair, newUuid, verifyRefreshToken } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { errorResponse, tokenResponse, unauthorized } from "@/lib/responses";
import { parseFormData } from "@/lib/server/http/errors";
import {
  assertTrustedOrigin,
  firstPartyRefreshCookie,
  hashRefreshCredential,
  isFirstPartyClient,
  isSupportedGrantType,
  verifyRefreshCredential,
} from "@/lib/server/auth/first-party-session";
import { apiErrorResponse } from "@/lib/server/http/errors";
import {
  listTwoFactorProviders,
  verifyTwoFactorProvider,
  verifyYubikeyOtp,
  verifyWebAuthnSecondFactor,
  type TwoFactorProvider,
} from "@/lib/server/auth/two-factor";
import {
  clearPasskeyChallengeCookie,
  verifyAndConsumePasskeyChallenge,
} from "@/lib/server/auth/passkey-challenge";
import { openServerSecret } from "@/lib/server/auth/server-secrets";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { recordAuditEvent } from "@/lib/server/audit/events";

const providerNames = new Map<number, TwoFactorProvider>([
  [0, "totp"],
  [3, "yubikey"],
  [7, "webauthn"],
]);

function expectedOrigin(request: NextRequest): string {
  return new URL(process.env.DOMAIN ?? request.nextUrl.origin).origin;
}

function isSecureCookie(request: NextRequest): boolean {
  return process.env.NODE_ENV === "production" || expectedOrigin(request).startsWith("https://");
}

function readRefreshCookie(request: NextRequest): string | null {
  return request.cookies.get("vw_refresh")?.value ?? null;
}

function twoFactorRequired(providers: number[]) {
  return new Response(
    JSON.stringify({
      error: "invalid_grant",
      error_description: "Two factor required.",
      TwoFactorProviders: providers,
      TwoFactorProviders2: Object.fromEntries(providers.map((provider) => [provider, null])),
      MasterPasswordPolicy: null,
    }),
    {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

async function issueSession(input: {
  request: NextRequest;
  user: typeof users.$inferSelect;
  device: typeof devices.$inferSelect;
  firstParty: boolean;
  extensions?: Record<string, unknown>;
}) {
  const { accessToken, refreshToken } = await generateTokenPair(input.user, input.device);
  const refreshTokenHash = await hashRefreshCredential(refreshToken);
  const now = new Date();
  await db
    .update(devices)
    .set({ refreshToken: "", refreshTokenHash, revokedAt: null, lastSeenAt: now, updatedAt: now })
    .where(eq(devices.uuid, input.device.uuid));

  const response = tokenResponse({
    accessToken,
    refreshToken,
    expiresIn: 3600,
    tokenType: "Bearer",
    user: input.user,
    masterPasswordPolicy: null,
    exposeRefreshToken: !input.firstParty,
    extensions: input.extensions,
  });
  if (input.firstParty) {
    response.headers.append("Set-Cookie", firstPartyRefreshCookie(refreshToken, isSecureCookie(input.request)));
  }
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await parseFormData(request, 64 * 1024);
    const grantType = formData.get("grant_type");
    const firstParty = isFirstPartyClient(formData.get("client_id"));
    if (firstParty) assertTrustedOrigin(request, expectedOrigin(request));
    if (!isSupportedGrantType(grantType)) return errorResponse("Unsupported grant_type");

    switch (grantType) {
      case "password":
        return handlePasswordLogin(request, formData, firstParty);
      case "refresh_token":
        return handleRefreshToken(request, formData, firstParty);
      case "passkey":
      case "urn:vercelwarden:params:oauth:grant-type:passkey":
        return handlePasskeyLogin(request, formData, firstParty);
      case "client_credentials":
        return errorResponse("API key login not yet implemented", 501);
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function handlePasskeyLogin(request: NextRequest, formData: FormData, firstParty: boolean) {
  if (!firstParty) return unauthorized("Passkey login is unavailable for this client.");
  const assertionValue = formData.get("passkeyAssertion");
  if (typeof assertionValue !== "string") return errorResponse("passkeyAssertion is required");
  let assertion: AuthenticationResponseJSON;
  try {
    assertion = JSON.parse(assertionValue) as AuthenticationResponseJSON;
  } catch {
    return errorResponse("Passkey assertion is invalid");
  }
  const challenge = await verifyAndConsumePasskeyChallenge(request.cookies.get("vw_passkey_challenge")?.value);
  const [passkey] = await db
    .select()
    .from(accountPasskeys)
    .where(eq(accountPasskeys.credentialId, assertion.id))
    .limit(1);
  if (!passkey) return unauthorized("Passkey authentication failed.");
  const origin = expectedOrigin(request);
  const verification = await verifyWebAuthnSecondFactor({
    response: assertion,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: new URL(origin).hostname,
    credential: {
      id: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: passkey.signCount,
      transports: passkey.transports,
    },
  }).catch(() => null);
  if (!verification?.verified) return unauthorized("Passkey authentication failed.");

  const [user] = await db.select().from(users).where(eq(users.uuid, passkey.userUuid)).limit(1);
  if (!user?.enabled) return unauthorized("Passkey authentication failed.");
  const deviceIdentifier = formData.get("deviceIdentifier");
  if (typeof deviceIdentifier !== "string" || !deviceIdentifier) return errorResponse("deviceIdentifier is required");
  const now = new Date();
  const [existingDevice] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.identifier, deviceIdentifier), eq(devices.userUuid, user.uuid)))
    .limit(1);
  let device: typeof devices.$inferSelect;
  if (existingDevice) {
    await db.update(devices).set({ revokedAt: null, lastSeenAt: now, updatedAt: now }).where(eq(devices.uuid, existingDevice.uuid));
    device = { ...existingDevice, revokedAt: null, lastSeenAt: now, updatedAt: now };
  } else {
    await db.delete(devices).where(and(eq(devices.identifier, deviceIdentifier), ne(devices.userUuid, user.uuid)));
    device = {
      uuid: newUuid(),
      userUuid: user.uuid,
      createdAt: now,
      updatedAt: now,
      name: String(formData.get("deviceName") ?? "Browser").slice(0, 100),
      systemName: null,
      note: null,
      type: Number(formData.get("deviceType") ?? 0) || 0,
      identifier: deviceIdentifier,
      refreshToken: "",
      refreshTokenHash: null,
      trustedAt: null,
      trustedUntil: null,
      lastSeenAt: now,
      revokedAt: null,
      pushToken: null,
      accessTokenExpiration: null,
    };
    await db.insert(devices).values(device);
  }
  await db
    .update(accountPasskeys)
    .set({ signCount: verification.authenticationInfo.newCounter, lastUsedAt: now, updatedAt: now })
    .where(eq(accountPasskeys.uuid, passkey.uuid));
  const response = await issueSession({
    request,
    user,
    device,
    firstParty,
    extensions: {
      VercelwardenPasskey: {
        directUnlock: passkey.directUnlock,
        encryptedUserKey: passkey.directUnlock ? passkey.encryptedUserKey : null,
        encryptedPrivateKey: passkey.directUnlock ? passkey.encryptedPrivateKey : null,
      },
    },
  });
  response.headers.append(
    "Set-Cookie",
    clearPasskeyChallengeCookie(isSecureCookie(request))
  );
  await recordAuditEvent({
    action: "authentication.passkey.login",
    actorUserUuid: user.uuid,
    actorEmailSnapshot: user.email,
    targetId: user.uuid,
    outcome: "succeeded",
    request,
    metadata: { directUnlock: passkey.directUnlock, deviceType: device.type },
  });
  return response;
}

async function handlePasswordLogin(request: NextRequest, formData: FormData, firstParty: boolean) {
  const email = String(formData.get("username") ?? "").normalize("NFKC").trim().toLowerCase();
  const password = formData.get("password");
  const deviceIdentifier = formData.get("deviceIdentifier");
  const deviceName = String(formData.get("deviceName") ?? "Unknown Device").slice(0, 100);
  const deviceTypeRaw = formData.get("deviceType");
  if (!email || typeof password !== "string" || typeof deviceIdentifier !== "string") {
    return errorResponse("Missing required fields");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user?.enabled || !verifyPassword(password, user.passwordHash as Uint8Array, user.salt as Uint8Array, user.passwordIterations)) {
    return unauthorized("Username or password is incorrect. Try again.");
  }

  const credentials = await db
    .select()
    .from(twoFactorCredentials)
    .where(and(eq(twoFactorCredentials.userUuid, user.uuid), eq(twoFactorCredentials.status, "active")));
  const providers = listTwoFactorProviders({ legacyTotp: Boolean(user.totpSecret), credentials });
  if (providers.length > 0) {
    const token = formData.get("twoFactorToken");
    if (typeof token !== "string" || !token) return twoFactorRequired(providers);
    const requestedProvider = Number(formData.get("twoFactorProvider") ?? providers[0]);
    const provider = providerNames.get(requestedProvider);
    if (!provider || !providers.includes(requestedProvider as 0 | 3 | 7)) return unauthorized("Two-factor code is invalid");
    const credential = credentials.find((item) => item.provider === provider);
    const credentialSecret = credential?.secretCiphertext ? openServerSecret(credential.secretCiphertext) : null;
    const valid = await verifyTwoFactorProvider({
      provider,
      token,
      totpSecret: provider === "totp" ? credentialSecret ?? user.totpSecret : null,
      verifyYubikey: async (otp) => Boolean(
        credentialSecret && otp.startsWith(credentialSecret) && await verifyYubikeyOtp(otp)
      ),
    });
    if (!valid) return unauthorized("Two-factor code is invalid");
  }

  const deviceType = typeof deviceTypeRaw === "string" ? Number.parseInt(deviceTypeRaw, 10) || 0 : 0;
  const [existingDevice] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.identifier, deviceIdentifier), eq(devices.userUuid, user.uuid)))
    .limit(1);
  const now = new Date();
  let device: typeof devices.$inferSelect;
  if (existingDevice) {
    await db.update(devices).set({ updatedAt: now, lastSeenAt: now, name: deviceName, revokedAt: null }).where(eq(devices.uuid, existingDevice.uuid));
    device = { ...existingDevice, updatedAt: now, lastSeenAt: now, name: deviceName, revokedAt: null };
  } else {
    await db.delete(devices).where(and(eq(devices.identifier, deviceIdentifier), ne(devices.userUuid, user.uuid)));
    device = {
      uuid: newUuid(),
      userUuid: user.uuid,
      createdAt: now,
      updatedAt: now,
      name: deviceName,
      systemName: null,
      note: null,
      type: deviceType,
      identifier: deviceIdentifier,
      refreshToken: "",
      refreshTokenHash: null,
      trustedAt: null,
      trustedUntil: null,
      lastSeenAt: now,
      revokedAt: null,
      pushToken: null,
      accessTokenExpiration: null,
    };
    await db.insert(devices).values(device);
  }
  const response = await issueSession({ request, user, device, firstParty });
  await recordAuditEvent({
    action: "authentication.password.login",
    actorUserUuid: user.uuid,
    actorEmailSnapshot: user.email,
    targetId: user.uuid,
    outcome: "succeeded",
    request,
    metadata: { deviceType: device.type },
  });
  return response;
}

async function handleRefreshToken(request: NextRequest, formData: FormData, firstParty: boolean) {
  const bodyToken = formData.get("refresh_token");
  const refreshTokenValue = firstParty ? readRefreshCookie(request) : typeof bodyToken === "string" ? bodyToken : null;
  if (!refreshTokenValue) return errorResponse("refresh_token is required");
  const claims = await verifyRefreshToken(refreshTokenValue);
  if (!claims) return unauthorized("Invalid or expired refresh token.");

  const [device] = await db.select().from(devices).where(eq(devices.uuid, claims.device)).limit(1);
  if (!device || device.userUuid !== claims.sub || device.revokedAt) return unauthorized("Invalid refresh token.");
  const matches = device.refreshTokenHash
    ? await verifyRefreshCredential(refreshTokenValue, device.refreshTokenHash)
    : device.refreshToken === refreshTokenValue;
  if (!matches) return unauthorized("Refresh token has been revoked.");

  const [user] = await db.select().from(users).where(eq(users.uuid, claims.sub)).limit(1);
  if (!user?.enabled) return unauthorized("User not found or disabled.");
  const response = await issueSession({ request, user, device, firstParty });
  await recordAuditEvent({
    action: "authentication.refresh",
    actorUserUuid: user.uuid,
    actorEmailSnapshot: user.email,
    targetId: device.uuid,
    outcome: "succeeded",
    request,
  });
  return response;
}
