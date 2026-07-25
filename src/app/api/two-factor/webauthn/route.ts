import { and, eq } from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { db } from "@/db";
import { recoveryCodeHashes, twoFactorCredentials } from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { buildCapabilityDocument } from "@/lib/contracts/capabilities";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { authorizeAccountMutation } from "@/lib/server/auth/account-mutation";
import { consumeReauthProof } from "@/lib/server/auth/reauth";
import { hashRecoveryCode } from "@/lib/server/auth/recovery-codes";
import {
  consumeWebAuthnSetupChallenge,
  issueWebAuthnSetupChallenge,
  setupChallengeCookie,
  setupChallengeCookieName,
} from "@/lib/server/auth/webauthn-setup";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";
import { generateRecoveryCode } from "@/lib/totp";

function targetOrigin(request: Request): URL {
  return new URL(process.env.DOMAIN ?? new URL(request.url).origin);
}

function assertEnabled() {
  if (!buildCapabilityDocument().capabilities["auth.twoFactorPasskey"]) {
    throw new ApiError(404, "not_found", "Two-factor Passkeys are unavailable.");
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
      purpose: "account.two-factor.manage",
      legacyMasterPasswordHash: body.masterPasswordHash,
    });
    const existing = await db.select({ credentialId: twoFactorCredentials.credentialId, transports: twoFactorCredentials.transports })
      .from(twoFactorCredentials).where(and(
        eq(twoFactorCredentials.userUuid, auth.user.uuid),
        eq(twoFactorCredentials.provider, "webauthn")
      ));
    const target = targetOrigin(request);
    const options = await generateRegistrationOptions({
      rpName: process.env.WEBAUTHN_RP_NAME ?? "Vercelwarden",
      rpID: process.env.WEBAUTHN_RP_ID ?? target.hostname,
      userName: auth.user.email,
      userID: new TextEncoder().encode(`2fa:${auth.user.uuid}`),
      userDisplayName: auth.user.name,
      attestationType: "none",
      authenticatorSelection: { residentKey: "discouraged", userVerification: "required" },
      excludeCredentials: existing.flatMap((item) => item.credentialId ? [{
        id: item.credentialId,
        transports: item.transports ? JSON.parse(item.transports) as AuthenticatorTransportFuture[] : undefined,
      }] : []),
    });
    const challenge = await issueWebAuthnSetupChallenge({ scope: "two-factor-passkey", userUuid: auth.user.uuid, challenge: options.challenge });
    const response = Response.json(options, { headers: { "Cache-Control": "no-store, max-age=0" } });
    response.headers.append("Set-Cookie", setupChallengeCookie("two-factor-passkey", challenge.token, target.protocol === "https:"));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertEnabled();
    const auth = await authenticateRequest(request);
    const body = await request.json().catch(() => null) as { response?: RegistrationResponseJSON; name?: string } | null;
    if (!body?.response) throw new ApiError(400, "validation_error", "A Passkey attestation response is required.");
    const cookie = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${setupChallengeCookieName("two-factor-passkey")}=([^;]+)`))?.[1];
    const challenge = await consumeWebAuthnSetupChallenge({
      scope: "two-factor-passkey",
      userUuid: auth.user.uuid,
      token: cookie ? decodeURIComponent(cookie) : undefined,
    });
    const target = targetOrigin(request);
    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: target.origin,
      expectedRPID: process.env.WEBAUTHN_RP_ID ?? target.hostname,
      requireUserVerification: true,
    });
    if (!verification.verified) throw new ApiError(400, "passkey_verification_failed", "The Passkey could not be verified.");
    const credential = verification.registrationInfo.credential;
    const recoveryCode = generateRecoveryCode();
    const now = new Date();
    const id = newUuid();
    await db.transaction(async (tx) => {
      await tx.insert(twoFactorCredentials).values({
        uuid: id,
        userUuid: auth.user.uuid,
        provider: "webauthn",
        name: body.name?.trim().slice(0, 100) || "Security Passkey",
        status: "active",
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
        signCount: credential.counter,
        createdAt: now,
      });
      await tx.insert(recoveryCodeHashes).values({
        uuid: newUuid(),
        userUuid: auth.user.uuid,
        codeHash: await hashRecoveryCode(recoveryCode),
        createdAt: now,
      });
    });
    const response = Response.json({ object: "twoFactorProvider", id, type: 7, enabled: true, recoveryCode }, {
      status: 201,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
    response.headers.append("Set-Cookie", setupChallengeCookie("two-factor-passkey", "", target.protocol === "https:", true));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertEnabled();
    const auth = await authenticateRequest(request);
    await consumeReauthProof(request, auth, "account.two-factor.manage");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ApiError(400, "validation_error", "Credential id is required.");
    const removed = await db.delete(twoFactorCredentials).where(and(
      eq(twoFactorCredentials.uuid, id),
      eq(twoFactorCredentials.userUuid, auth.user.uuid),
      eq(twoFactorCredentials.provider, "webauthn")
    )).returning({ id: twoFactorCredentials.uuid });
    if (removed.length !== 1) throw new ApiError(404, "not_found", "The requested credential was not found.");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
