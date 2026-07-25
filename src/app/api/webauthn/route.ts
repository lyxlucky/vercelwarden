import { eq } from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { db } from "@/db";
import { accountPasskeys } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { buildCapabilityDocument } from "@/lib/contracts/capabilities";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import {
  consumeWebAuthnSetupChallenge,
  issueWebAuthnSetupChallenge,
  setupChallengeCookie,
  setupChallengeCookieName,
} from "@/lib/server/auth/webauthn-setup";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

function origin(request: Request): URL {
  return new URL(process.env.DOMAIN ?? new URL(request.url).origin);
}

function assertEnabled() {
  if (!buildCapabilityDocument().capabilities["auth.accountPasskey"]) {
    throw new ApiError(404, "not_found", "Account Passkeys are unavailable.");
  }
}

export async function GET(request: Request) {
  try {
    assertEnabled();
    const auth = await authenticateRequest(request);
    const passkeys = await db.select().from(accountPasskeys).where(eq(accountPasskeys.userUuid, auth.user.uuid));
    return Response.json({
      data: passkeys.map((passkey) => ({
        id: passkey.uuid,
        name: passkey.name,
        credentialId: passkey.credentialId,
        directUnlock: passkey.directUnlock,
        creationDate: passkey.createdAt.toISOString(),
        revisionDate: passkey.updatedAt.toISOString(),
        lastUsedDate: passkey.lastUsedAt?.toISOString() ?? null,
        object: "accountPasskey",
      })),
      object: "list",
      continuationToken: null,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertEnabled();
    const auth = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    await authorizeAccountMutation({
      request,
      auth,
      purpose: "account.passkey.manage",
      legacyMasterPasswordHash: body.masterPasswordHash,
    });
    const existing = await db.select({ credentialId: accountPasskeys.credentialId, transports: accountPasskeys.transports })
      .from(accountPasskeys).where(eq(accountPasskeys.userUuid, auth.user.uuid));
    const target = origin(request);
    const options = await generateRegistrationOptions({
      rpName: process.env.WEBAUTHN_RP_NAME ?? "Vercelwarden",
      rpID: process.env.WEBAUTHN_RP_ID ?? target.hostname,
      userName: auth.user.email,
      userID: new TextEncoder().encode(auth.user.uuid),
      userDisplayName: auth.user.name,
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: existing.map((item) => ({
        id: item.credentialId,
        transports: item.transports ? JSON.parse(item.transports) as AuthenticatorTransportFuture[] : undefined,
      })),
      extensions: buildCapabilityDocument().capabilities["auth.passkeyDirectUnlock"]
        ? ({ prf: {} } as unknown as Parameters<typeof generateRegistrationOptions>[0]["extensions"])
        : undefined,
    });
    const challenge = await issueWebAuthnSetupChallenge({ scope: "account-passkey", userUuid: auth.user.uuid, challenge: options.challenge });
    const response = Response.json(options, { headers: { "Cache-Control": "no-store, max-age=0" } });
    response.headers.append("Set-Cookie", setupChallengeCookie("account-passkey", challenge.token, target.protocol === "https:"));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertEnabled();
    const auth = await authenticateRequest(request);
    const body = await request.json().catch(() => null) as {
      response?: RegistrationResponseJSON;
      name?: string;
      directUnlock?: boolean;
      encryptedUserKey?: string;
      encryptedPrivateKey?: string;
    } | null;
    if (!body?.response) throw new ApiError(400, "validation_error", "A Passkey attestation response is required.");
    const cookie = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${setupChallengeCookieName("account-passkey")}=([^;]+)`))?.[1];
    const challenge = await consumeWebAuthnSetupChallenge({
      scope: "account-passkey",
      userUuid: auth.user.uuid,
      token: cookie ? decodeURIComponent(cookie) : undefined,
    });
    const target = origin(request);
    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: target.origin,
      expectedRPID: process.env.WEBAUTHN_RP_ID ?? target.hostname,
      requireUserVerification: true,
    });
    if (!verification.verified) throw new ApiError(400, "passkey_verification_failed", "The Passkey could not be verified.");
    const directUnlock = Boolean(body.directUnlock);
    if (directUnlock && (!buildCapabilityDocument().capabilities["auth.passkeyDirectUnlock"] || !body.encryptedUserKey)) {
      throw new ApiError(400, "passkey_direct_unlock_invalid", "Direct unlock requires PRF support and encrypted key wrappers.");
    }
    const now = new Date();
    const credential = verification.registrationInfo.credential;
    const created = {
      uuid: newUuid(),
      userUuid: auth.user.uuid,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      name: body.name?.trim().slice(0, 100) || "Passkey",
      signCount: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      directUnlock,
      encryptedUserKey: directUnlock ? body.encryptedUserKey ?? null : null,
      encryptedPrivateKey: directUnlock ? body.encryptedPrivateKey ?? null : null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(accountPasskeys).values(created);
    const response = Response.json({ object: "accountPasskey", id: created.uuid, name: created.name, directUnlock }, {
      status: 201,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
    response.headers.append("Set-Cookie", setupChallengeCookie("account-passkey", "", target.protocol === "https:", true));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
