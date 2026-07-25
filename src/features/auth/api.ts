"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { ApiClientError, createApiClient } from "@/lib/client/api/client";
import {
  deriveMasterKey,
  deriveMasterPasswordHash,
  encryptWithUserKey,
  normalizeEmail,
  unwrapVaultKey,
  wipeBytes,
  wrapVaultKey,
} from "@/lib/client/crypto/auth";
import {
  addPasskeyPrfInput,
  passkeyPrfSalt,
  readPasskeyPrfResult,
  unwrapVaultKeyWithPasskeyPrf,
} from "@/lib/client/crypto/passkey-prf";
import { sessionStore, type SessionRole } from "@/lib/client/state/session-store";
import type { CapabilityMap } from "@/lib/contracts/capabilities";
import { authSecretStore } from "@/features/auth/secret-store";
import { unlockOfflineVault } from "@/lib/client/offline/unlock";

const publicApi = createApiClient();
const encoder = new TextEncoder();

interface PreloginResponse {
  kdf: number;
  kdfIterations: number;
  kdfMemory: number | null;
  kdfParallelism: number | null;
}

export interface AuthTokenResponse {
  access_token: string;
  Key?: string;
  Kdf?: number;
  KdfIterations?: number;
  VercelwardenPasskey?: {
    directUnlock: boolean;
    encryptedUserKey: string | null;
    encryptedPrivateKey: string | null;
  };
}

export interface PreparedPasswordLogin {
  email: string;
  masterPasswordHash: string;
  masterKey: Uint8Array;
  deviceIdentifier: string;
}

export class TwoFactorRequiredError extends Error {
  constructor(public readonly providers: number[], public readonly prepared: PreparedPasswordLogin) {
    super("Two-factor authentication is required.");
    this.name = "TwoFactorRequiredError";
  }
}

function base64(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function decodeJwt(token: string): { sub?: string; email?: string; name?: string; role?: SessionRole } {
  try {
    const value = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, "=")));
  } catch {
    return {};
  }
}

function browserDeviceIdentifier(): string {
  const key = "vercelwarden.device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export async function fetchServerConfig() {
  const config = await publicApi<{
    vercelwarden: {
      registration: { enabled: boolean; inviteRequired: boolean };
      capabilities: CapabilityMap;
    };
  }>("/api/config");
  sessionStore.setCapabilities(config.vercelwarden.capabilities);
  return config;
}

export async function prelogin(email: string): Promise<PreloginResponse> {
  return publicApi<PreloginResponse>("/identity/accounts/prelogin", {
    method: "POST",
    body: { email: normalizeEmail(email) },
  });
}

export async function preparePasswordLogin(email: string, password: string): Promise<PreparedPasswordLogin> {
  const normalizedEmail = normalizeEmail(email);
  const kdf = await prelogin(normalizedEmail);
  const passwordBytes = encoder.encode(password);
  const salt = encoder.encode(normalizedEmail);
  try {
    const masterKey = await deriveMasterKey(kdf.kdf === 1
      ? {
          algorithm: "argon2id",
          password: passwordBytes,
          salt,
          iterations: kdf.kdfIterations,
          memoryKiB: (kdf.kdfMemory ?? 64) * 1024,
          parallelism: kdf.kdfParallelism ?? 4,
        }
      : {
          algorithm: "pbkdf2",
          password: passwordBytes,
          salt,
          iterations: kdf.kdfIterations,
        });
    const loginHash = await deriveMasterPasswordHash(masterKey, passwordBytes);
    return {
      email: normalizedEmail,
      masterPasswordHash: base64(loginHash),
      masterKey,
      deviceIdentifier: browserDeviceIdentifier(),
    };
  } finally {
    wipeBytes(passwordBytes);
    wipeBytes(salt);
  }
}

function establishSession(
  token: AuthTokenResponse,
  email: string,
  masterKey?: Uint8Array,
  unlocked = Boolean(masterKey)
) {
  const claims = decodeJwt(token.access_token);
  sessionStore.authenticate({
    accessToken: token.access_token,
    user: {
      id: claims.sub ?? email,
      email: claims.email ?? email,
      name: claims.name,
      roles: [claims.role === "admin" ? "admin" : "user"],
    },
    unlocked,
  });
  if (token.Key && claims.sub) {
    localStorage.setItem(`vercelwarden.account.${claims.sub}.wrapped-key`, token.Key);
  }
}

export async function submitPasswordLogin(
  prepared: PreparedPasswordLogin,
  twoFactor?: { provider: number; token: string }
): Promise<AuthTokenResponse> {
  const form = new FormData();
  form.set("grant_type", "password");
  form.set("client_id", "vercelwarden-web");
  form.set("username", prepared.email);
  form.set("password", prepared.masterPasswordHash);
  form.set("deviceIdentifier", prepared.deviceIdentifier);
  form.set("deviceName", navigator.userAgent.slice(0, 100));
  form.set("deviceType", "9");
  if (twoFactor) {
    form.set("twoFactorProvider", String(twoFactor.provider));
    form.set("twoFactorToken", twoFactor.token);
  }
  try {
    const response = await publicApi<AuthTokenResponse>("/identity/connect/token", { method: "POST", body: form });
    if (response.Key) {
      const vaultKey = await unwrapVaultKey(response.Key, prepared.masterKey);
      authSecretStore.set({ masterKey: prepared.masterKey, vaultKey });
      wipeBytes(vaultKey);
    } else {
      authSecretStore.set({ masterKey: prepared.masterKey });
    }
    establishSession(response, prepared.email, prepared.masterKey);
    return response;
  } catch (error) {
    if (error instanceof ApiClientError && Array.isArray(error.body.TwoFactorProviders)) {
      throw new TwoFactorRequiredError(error.body.TwoFactorProviders as number[], prepared);
    }
    throw error;
  }
}

export function cancelPreparedLogin(prepared: PreparedPasswordLogin | null) {
  if (prepared) wipeBytes(prepared.masterKey);
}

export async function registerAccount(input: {
  email: string;
  name: string;
  password: string;
  passwordHint?: string;
  invitationCode?: string;
}) {
  const email = normalizeEmail(input.email);
  const passwordBytes = encoder.encode(input.password);
  const salt = encoder.encode(email);
  const masterKey = await deriveMasterKey({
    algorithm: "argon2id",
    password: passwordBytes,
    salt,
    iterations: 3,
    memoryKiB: 64 * 1024,
    parallelism: 4,
  });
  const vaultKey = crypto.getRandomValues(new Uint8Array(64));
  let privateKeyBytes: Uint8Array | null = null;
  try {
    const loginHash = await deriveMasterPasswordHash(masterKey, passwordBytes);
    const wrappedVaultKey = await wrapVaultKey(vaultKey, masterKey);
    const pair = await crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["encrypt", "decrypt"]
    );
    const publicKey = base64(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
    privateKeyBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const privateKey = await encryptWithUserKey(privateKeyBytes, vaultKey);
    return publicApi<{ object: "register"; id: string }>("/api/accounts/register", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: {
        clientId: "vercelwarden-web",
        email,
        name: input.name,
        masterPasswordHash: base64(loginHash),
        masterPasswordHint: input.passwordHint || null,
        key: wrappedVaultKey,
        privateKey,
        publicKey,
        kdf: 1,
        kdfIterations: 3,
        kdfMemory: 64,
        kdfParallelism: 4,
        invitationCode: input.invitationCode || undefined,
      },
    });
  } finally {
    wipeBytes(passwordBytes);
    wipeBytes(salt);
    wipeBytes(masterKey);
    wipeBytes(vaultKey);
    wipeBytes(privateKeyBytes ?? undefined);
  }
}

export async function loginWithPasskey() {
  const options = await publicApi<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
    "/identity/accounts/webauthn/assertion-options"
  );
  const directUnlockEnabled = sessionStore.getSnapshot().capabilities["auth.passkeyDirectUnlock"];
  const salt = directUnlockEnabled ? await passkeyPrfSalt() : null;
  const assertion = await startAuthentication({
    optionsJSON: salt ? addPasskeyPrfInput(options, salt) : options,
  });
  const prfResult = readPasskeyPrfResult(assertion);
  const extensionResults = assertion.clientExtensionResults as Record<string, unknown>;
  const serializableAssertion = {
    ...assertion,
    clientExtensionResults: Object.fromEntries(
      Object.entries(extensionResults).filter(([key]) => key !== "prf")
    ),
  };
  const form = new FormData();
  form.set("grant_type", "passkey");
  form.set("client_id", "vercelwarden-web");
  form.set("passkeyAssertion", JSON.stringify(serializableAssertion));
  form.set("deviceIdentifier", browserDeviceIdentifier());
  form.set("deviceName", navigator.userAgent.slice(0, 100));
  form.set("deviceType", "9");
  const response = await publicApi<AuthTokenResponse>("/identity/connect/token", { method: "POST", body: form });
  let vaultKey: Uint8Array | null = null;
  establishSession(response, "", undefined, false);
  try {
    if (response.VercelwardenPasskey?.directUnlock) {
      if (!prfResult || !response.VercelwardenPasskey.encryptedUserKey) {
        throw new Error("该 Passkey 无法在当前浏览器直接解锁，请使用主密码。");
      }
      vaultKey = await unwrapVaultKeyWithPasskeyPrf(
        response.VercelwardenPasskey.encryptedUserKey,
        prfResult
      );
      authSecretStore.set({ vaultKey });
      sessionStore.unlock();
    }
  } finally {
    wipeBytes(prfResult ?? undefined);
    wipeBytes(salt ?? undefined);
    wipeBytes(vaultKey ?? undefined);
  }
  return response;
}

export async function unlockWithPasskey() {
  const response = await loginWithPasskey();
  if (sessionStore.getSnapshot().phase !== "unlocked") {
    throw new Error("该 Passkey 仅用于登录，请使用主密码解锁密码库。");
  }
  return response;
}

export async function refreshSession() {
  const form = new FormData();
  form.set("grant_type", "refresh_token");
  form.set("client_id", "vercelwarden-web");
  const response = await publicApi<AuthTokenResponse>("/identity/connect/token", { method: "POST", body: form });
  establishSession(response, "");
  sessionStore.lock();
  return response;
}

export async function unlockWithPassword(password: string) {
  const session = sessionStore.getSnapshot();
  if (!session.user) throw new Error("No account session is available.");
  if (session.phase === "locked-offline" || !sessionStore.getAccessToken()) {
    await unlockOfflineVault(password);
    return;
  }
  const prepared = await preparePasswordLogin(session.user.email, password);
  try {
    const wrappedKey = localStorage.getItem(`vercelwarden.account.${session.user.id}.wrapped-key`);
    if (!wrappedKey) {
      await submitPasswordLogin(prepared);
      return;
    }
    const vaultKey = await unwrapVaultKey(wrappedKey, prepared.masterKey);
    authSecretStore.set({ masterKey: prepared.masterKey, vaultKey });
    wipeBytes(vaultKey);
    sessionStore.unlock();
  } finally {
    cancelPreparedLogin(prepared);
  }
}

export async function verifyMasterPassword(password: string) {
  const session = sessionStore.getSnapshot();
  if (!session.user) throw new Error("No account session is available.");
  const prepared = await preparePasswordLogin(session.user.email, password);
  try {
    await publicApi<void>("/api/accounts/verify-password", {
      method: "POST",
      body: { masterPasswordHash: prepared.masterPasswordHash },
    });
  } finally {
    cancelPreparedLogin(prepared);
  }
}

export async function recoverTwoFactor(email: string, password: string, recoveryCode: string) {
  const prepared = await preparePasswordLogin(email, password);
  try {
    return await publicApi<{
      object: "twoFactorRecovery";
      twoFactorEnabled: false;
      sessionsRevoked: true;
      recoveryCodeConsumed: true;
    }>("/identity/accounts/recover-2fa", {
      method: "POST",
      body: {
        email: prepared.email,
        masterPasswordHash: prepared.masterPasswordHash,
        recoveryCode,
      },
    });
  } finally {
    cancelPreparedLogin(prepared);
  }
}

export async function revokeSession() {
  const form = new FormData();
  form.set("client_id", "vercelwarden-web");
  await publicApi<void>("/identity/connect/revocation", { method: "POST", body: form });
}
