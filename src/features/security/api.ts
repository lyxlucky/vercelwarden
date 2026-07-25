"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { apiClient } from "@/lib/client/api/client";
import {
  deriveMasterKey,
  deriveMasterPasswordHash,
  wipeBytes,
  wrapVaultKey,
} from "@/lib/client/crypto/auth";
import {
  addPasskeyPrfInput,
  passkeyPrfSalt,
  readPasskeyPrfResult,
  wrapVaultKeyWithPasskeyPrf,
} from "@/lib/client/crypto/passkey-prf";
import { sessionStore } from "@/lib/client/state/session-store";
import { cancelPreparedLogin, preparePasswordLogin, prelogin } from "@/features/auth/api";
import { authSecretStore } from "@/features/auth/secret-store";
import type { ReauthPurpose } from "@/lib/contracts/account-security";

function base64(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

export async function requestReauthentication(purpose: ReauthPurpose, password: string) {
  const user = sessionStore.getSnapshot().user;
  if (!user) throw new Error("当前没有可用账号会话。");
  const prepared = await preparePasswordLogin(user.email, password);
  try {
    return await apiClient<{ proof: string; purpose: ReauthPurpose; expiresAt: string }>("/api/accounts/reauth", {
      method: "POST",
      body: { purpose, masterPasswordHash: prepared.masterPasswordHash },
    });
  } finally {
    cancelPreparedLogin(prepared);
  }
}

export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  masterPasswordHint: string | null;
  creationDate: string;
}

export function fetchAccountProfile() {
  return apiClient<AccountProfile>("/api/accounts/profile");
}

export async function updateAccountProfile(input: { name: string; hint: string | null; password?: string }) {
  const headers: HeadersInit = {};
  if (input.password !== undefined) {
    headers["X-Reauth-Proof"] = (await requestReauthentication("account.hint.change", input.password)).proof;
  }
  return apiClient<AccountProfile>("/api/accounts/profile", {
    method: "PUT",
    headers,
    body: { name: input.name, masterPasswordHint: input.hint },
  });
}

async function deriveNewCredentials(password: string, kdf: {
  type: number;
  iterations: number;
  memory?: number | null;
  parallelism?: number | null;
}) {
  const user = sessionStore.getSnapshot().user;
  const vaultKey = authSecretStore.getVaultKey();
  if (!user || !vaultKey) throw new Error("请先解锁密码库再修改主密码或 KDF。");
  const passwordBytes = new TextEncoder().encode(password);
  const salt = new TextEncoder().encode(user.email.normalize("NFKC").trim().toLowerCase());
  const masterKey = await deriveMasterKey(kdf.type === 1 ? {
    algorithm: "argon2id",
    password: passwordBytes,
    salt,
    iterations: kdf.iterations,
    memoryKiB: (kdf.memory ?? 64) * 1024,
    parallelism: kdf.parallelism ?? 4,
  } : {
    algorithm: "pbkdf2",
    password: passwordBytes,
    salt,
    iterations: kdf.iterations,
  });
  try {
    const loginHash = await deriveMasterPasswordHash(masterKey, passwordBytes);
    const key = await wrapVaultKey(vaultKey, masterKey);
    return { masterPasswordHash: base64(loginHash), key, masterKey: masterKey.slice() };
  } finally {
    wipeBytes(passwordBytes);
    wipeBytes(salt);
    wipeBytes(masterKey);
    wipeBytes(vaultKey);
  }
}

export async function changeMasterPassword(input: { currentPassword: string; newPassword: string }) {
  const user = sessionStore.getSnapshot().user;
  if (!user) throw new Error("当前没有可用账号会话。");
  const currentKdf = await prelogin(user.email);
  const proof = await requestReauthentication("account.password.change", input.currentPassword);
  const next = await deriveNewCredentials(input.newPassword, {
    type: currentKdf.kdf,
    iterations: currentKdf.kdfIterations,
    memory: currentKdf.kdfMemory,
    parallelism: currentKdf.kdfParallelism,
  });
  try {
    await apiClient<void>("/api/accounts/password", {
      method: "POST",
      headers: { "X-Reauth-Proof": proof.proof },
      body: { newMasterPasswordHash: next.masterPasswordHash, key: next.key },
    });
    localStorage.setItem(`vercelwarden.account.${user.id}.wrapped-key`, next.key);
    authSecretStore.set({ masterKey: next.masterKey });
  } finally {
    wipeBytes(next.masterKey);
  }
}

export async function changeKdf(input: {
  password: string;
  type: number;
  iterations: number;
  memory?: number | null;
  parallelism?: number | null;
}) {
  const user = sessionStore.getSnapshot().user;
  if (!user) throw new Error("当前没有可用账号会话。");
  const proof = await requestReauthentication("account.kdf.change", input.password);
  const next = await deriveNewCredentials(input.password, input);
  try {
    await apiClient<void>("/api/accounts/kdf", {
      method: "POST",
      headers: { "X-Reauth-Proof": proof.proof },
      body: {
        newMasterPasswordHash: next.masterPasswordHash,
        key: next.key,
        kdf: input.type,
        kdfIterations: input.iterations,
        kdfMemory: input.memory,
        kdfParallelism: input.parallelism,
      },
    });
    localStorage.setItem(`vercelwarden.account.${user.id}.wrapped-key`, next.key);
    authSecretStore.set({ masterKey: next.masterKey });
  } finally {
    wipeBytes(next.masterKey);
  }
}

export async function revealApiKey(password: string, rotate = false) {
  const proof = await requestReauthentication("account.api-key.rotate", password);
  return apiClient<{ apiKey: string }>("/api/accounts/api-key", {
    method: rotate ? "POST" : "GET",
    headers: { "X-Reauth-Proof": proof.proof },
  });
}

export interface TwoFactorCredential {
  id: string;
  name: string;
  provider: "totp" | "yubikey" | "webauthn";
  type: number;
  enabled: boolean;
  status: string;
  creationDate: string;
  lastUsedDate: string | null;
}

export async function listTwoFactorCredentials() {
  const result = await apiClient<{ data: TwoFactorCredential[] }>("/api/two-factor");
  return result.data;
}

export async function beginTotpSetup(password: string) {
  const proof = await requestReauthentication("account.two-factor.manage", password);
  return apiClient<{ key: string; uri: string; enabled: boolean }>("/api/two-factor/get-authenticator", {
    method: "POST",
    headers: { "X-Reauth-Proof": proof.proof },
    body: {},
  });
}

export async function finishTotpSetup(input: { password: string; key: string; token: string; name: string }) {
  const proof = await requestReauthentication("account.two-factor.manage", input.password);
  return apiClient<{ recoveryCode: string }>("/api/two-factor/authenticator", {
    method: "PUT",
    headers: { "X-Reauth-Proof": proof.proof },
    body: { key: input.key, token: input.token, name: input.name },
  });
}

export async function disableTwoFactor(type: number, password: string) {
  const proof = await requestReauthentication("account.two-factor.manage", password);
  return apiClient<void>("/api/two-factor/disable", {
    method: "PUT",
    headers: { "X-Reauth-Proof": proof.proof },
    body: { type },
  });
}

export async function renameTwoFactorCredential(id: string, name: string, password: string) {
  const proof = await requestReauthentication("account.two-factor.manage", password);
  return apiClient<TwoFactorCredential>(`/api/two-factor/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "X-Reauth-Proof": proof.proof },
    body: { name },
  });
}

export async function addYubiKey(input: { password: string; otp: string; name: string }) {
  const proof = await requestReauthentication("account.two-factor.manage", input.password);
  return apiClient<{ id: string }>("/api/two-factor/yubikey", {
    method: "PUT",
    headers: { "X-Reauth-Proof": proof.proof },
    body: { otp: input.otp, name: input.name },
  });
}

export async function createTwoFactorPasskey(input: { password: string; name: string }) {
  const proof = await requestReauthentication("account.two-factor.manage", input.password);
  const options = await apiClient<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
    "/api/two-factor/webauthn",
    {
      method: "POST",
      headers: { "X-Reauth-Proof": proof.proof },
      body: {},
    }
  );
  const response = await startRegistration({ optionsJSON: options });
  return apiClient<{ id: string; recoveryCode: string }>("/api/two-factor/webauthn", {
    method: "PUT",
    body: { response, name: input.name },
  });
}

export async function deleteTwoFactorPasskey(id: string, password: string) {
  const proof = await requestReauthentication("account.two-factor.manage", password);
  return apiClient<void>(`/api/two-factor/webauthn?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
  });
}

export async function rotateRecoveryCodes(password: string) {
  const proof = await requestReauthentication("account.recovery-code.rotate", password);
  return apiClient<{ codes: string[] }>("/api/accounts/totp/recovery-code", {
    method: "POST",
    headers: { "X-Reauth-Proof": proof.proof },
    body: {},
  });
}

export interface AccountPasskeySummary {
  id: string;
  name: string;
  directUnlock: boolean;
  creationDate: string;
  lastUsedDate: string | null;
}

export async function listAccountPasskeys() {
  const result = await apiClient<{ data: AccountPasskeySummary[] }>("/api/webauthn");
  return result.data;
}

export async function createAccountPasskey(input: {
  password: string;
  name: string;
  directUnlock?: boolean;
  encryptedUserKey?: string;
  encryptedPrivateKey?: string;
}) {
  const proof = await requestReauthentication("account.passkey.manage", input.password);
  const options = await apiClient<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/webauthn", {
    method: "POST",
    headers: { "X-Reauth-Proof": proof.proof },
    body: {},
  });
  const directUnlock = Boolean(input.directUnlock);
  const vaultKey = directUnlock ? authSecretStore.getVaultKey() : null;
  const salt = directUnlock ? await passkeyPrfSalt() : null;
  let prfResult: Uint8Array | null = null;
  try {
    if (directUnlock && !vaultKey) throw new Error("请先解锁密码库再创建直接解锁 Passkey。");
    const response = await startRegistration({
      optionsJSON: salt ? addPasskeyPrfInput(options, salt) : options,
    });
    prfResult = readPasskeyPrfResult(response);
    if (directUnlock && !prfResult) {
      throw new Error("当前浏览器或验证器不支持 Passkey PRF，已安全回退；请创建仅登录 Passkey。");
    }
    const encryptedUserKey = directUnlock
      ? await wrapVaultKeyWithPasskeyPrf(vaultKey!, prfResult!)
      : input.encryptedUserKey;
    return await apiClient<AccountPasskeySummary>("/api/webauthn", {
      method: "PUT",
      body: {
        response,
        name: input.name,
        directUnlock,
        encryptedUserKey,
        encryptedPrivateKey: input.encryptedPrivateKey,
      },
    });
  } finally {
    wipeBytes(vaultKey ?? undefined);
    wipeBytes(salt ?? undefined);
    wipeBytes(prfResult ?? undefined);
  }
}

export async function deleteAccountPasskey(id: string, password: string) {
  const proof = await requestReauthentication("account.passkey.manage", password);
  return apiClient<void>(`/api/webauthn/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
  });
}
