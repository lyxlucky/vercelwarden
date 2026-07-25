import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { verifyTotp } from "@/lib/totp";

export type TwoFactorProvider = "totp" | "yubikey" | "webauthn";
export type TwoFactorProviderId = 0 | 3 | 7;

const providerIds: Record<TwoFactorProvider, TwoFactorProviderId> = {
  totp: 0,
  yubikey: 3,
  webauthn: 7,
};

export interface TwoFactorCredentialSummary {
  provider: TwoFactorProvider;
  status: "pending" | "active" | "disabled";
}

export function listTwoFactorProviders(input: {
  legacyTotp: boolean;
  credentials: TwoFactorCredentialSummary[];
}): TwoFactorProviderId[] {
  const active = new Set<TwoFactorProviderId>();
  if (input.legacyTotp) active.add(0);
  for (const credential of input.credentials) {
    if (credential.status === "active") active.add(providerIds[credential.provider]);
  }
  return [...active].sort((left, right) => left - right);
}

export async function verifyTwoFactorProvider(input: {
  provider: TwoFactorProvider;
  token: string;
  totpSecret?: string | null;
  verifyYubikey?: (otp: string) => Promise<boolean>;
  verifyWebAuthn?: (assertion: string) => Promise<boolean>;
}): Promise<boolean> {
  switch (input.provider) {
    case "totp":
      return Boolean(input.totpSecret && verifyTotp(input.totpSecret, input.token));
    case "yubikey":
      return input.verifyYubikey?.(input.token) ?? false;
    case "webauthn":
      return input.verifyWebAuthn?.(input.token) ?? false;
  }
}

function canonicalYubicoFields(fields: Map<string, string>): string {
  return [...fields.entries()]
    .filter(([key]) => key !== "h")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export async function verifyYubikeyOtp(otp: string): Promise<boolean> {
  const clientId = process.env.YUBICO_CLIENT_ID;
  const secretValue = process.env.YUBICO_SECRET_KEY;
  if (!clientId || !secretValue || !/^[cbdefghijklnrtuv]{44}$/.test(otp)) return false;
  const secret = Buffer.from(secretValue, "base64");
  if (secret.length === 0) return false;
  const nonce = randomBytes(20).toString("hex");
  const requestFields = new Map([
    ["id", clientId],
    ["nonce", nonce],
    ["otp", otp],
    ["sl", "secure"],
    ["timeout", "10"],
    ["timestamp", "1"],
  ]);
  const signature = createHmac("sha1", secret).update(canonicalYubicoFields(requestFields)).digest("base64");
  const query = new URLSearchParams(Object.fromEntries(requestFields));
  query.set("h", signature);

  try {
    const response = await fetch(`https://api2.yubico.com/wsapi/2.0/verify?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return false;
    const responseFields = new Map<string, string>();
    for (const line of (await response.text()).split(/\r?\n/)) {
      const separator = line.indexOf("=");
      if (separator > 0) responseFields.set(line.slice(0, separator), line.slice(separator + 1));
    }
    const responseSignature = responseFields.get("h");
    if (!responseSignature) return false;
    const expectedSignature = createHmac("sha1", secret)
      .update(canonicalYubicoFields(responseFields))
      .digest();
    const actualSignature = Buffer.from(responseSignature, "base64");
    return actualSignature.length === expectedSignature.length &&
      timingSafeEqual(actualSignature, expectedSignature) &&
      responseFields.get("status") === "OK" &&
      responseFields.get("nonce") === nonce &&
      responseFields.get("otp") === otp;
  } catch {
    return false;
  }
}

export async function verifyWebAuthnSecondFactor(input: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: {
    id: string;
    publicKey: string;
    counter: number;
    transports?: string | null;
  };
}) {
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.expectedOrigin,
    expectedRPID: input.expectedRPID,
    requireUserVerification: true,
    credential: {
      id: input.credential.id,
      publicKey: new Uint8Array(Buffer.from(input.credential.publicKey, "base64url")),
      counter: input.credential.counter,
      transports: input.credential.transports
        ? JSON.parse(input.credential.transports) as AuthenticatorTransportFuture[]
        : undefined,
    },
  });
  return verification;
}
