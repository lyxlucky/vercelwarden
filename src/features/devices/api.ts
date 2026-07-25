"use client";

import { apiClient } from "@/lib/client/api/client";
import { requestReauthentication } from "@/features/security/api";
import { authSecretStore } from "@/features/auth/secret-store";
import { wipeBytes } from "@/lib/client/crypto/auth";

export interface DeviceSummary {
  id: string;
  identifier: string;
  name: string;
  systemName: string | null;
  note: string | null;
  type: number;
  creationDate: string;
  lastSeenDate: string;
  online: boolean;
  trustState: "untrusted" | "trusted-temporary" | "trusted-permanent" | "revoked";
  current: boolean;
}

export async function listDevices() {
  const result = await apiClient<{ data: DeviceSummary[] }>("/api/devices/authorized");
  return result.data;
}

export function renameDevice(identifier: string, name: string) {
  return apiClient<DeviceSummary>(`/api/devices/${encodeURIComponent(identifier)}/name`, { method: "PUT", body: { name } });
}

export async function trustDevice(identifier: string, password: string) {
  const proof = await requestReauthentication("device.trust", password);
  return apiClient<DeviceSummary>(`/api/devices/authorized/${encodeURIComponent(identifier)}/permanent`, {
    method: "POST",
    headers: { "X-Reauth-Proof": proof.proof },
    body: {},
  });
}

export function untrustDevice(identifier: string) {
  return apiClient<DeviceSummary>(`/api/devices/authorized/${encodeURIComponent(identifier)}`, { method: "DELETE" });
}

export async function untrustAllDevices(password: string) {
  const proof = await requestReauthentication("device.trust", password);
  return apiClient<{ changed: number }>("/api/devices/authorized", {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
  });
}

export async function removeDevice(identifier: string, password: string) {
  const proof = await requestReauthentication("device.remove", password);
  return apiClient<void>(`/api/devices/${encodeURIComponent(identifier)}`, {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
  });
}

export async function removeDevices(identifiers: string[], password: string) {
  const proof = await requestReauthentication("device.remove", password);
  return apiClient<{ removed: number; outcomes: Array<{ identifier: string; status: string }> }>("/api/devices", {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
    body: { identifiers },
  });
}

export async function removeAllOtherDevices(password: string) {
  const proof = await requestReauthentication("device.remove", password);
  return apiClient<{ removed: number }>("/api/devices", {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof.proof },
  });
}

export interface AuthRequestSummary {
  id: string;
  requestDeviceIdentifier: string;
  requestDeviceType: number;
  ipAddress: string | null;
  countryCode: string | null;
  creationDate: string;
  expirationDate: string;
  requestPublicKey: string;
  fingerprintPhrase: string;
}

export async function listPendingAuthRequests() {
  const result = await apiClient<{ data: AuthRequestSummary[] }>("/api/auth-requests/pending");
  return result.data;
}

export function respondToAuthRequest(id: string, approved: boolean, encryptedKey?: string) {
  return apiClient<void>(`/api/auth-requests/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { approved, encryptedKey },
  });
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64Url(value: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function approveAuthRequest(request: AuthRequestSummary) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("请先解锁密码库再批准登录请求。");
  try {
    const publicKey = await crypto.subtle.importKey(
      "spki",
      decodeBase64Url(request.requestPublicKey),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
    const encryptedKey = encodeBase64Url(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, vaultKey));
    return respondToAuthRequest(request.id, true, encryptedKey);
  } finally {
    wipeBytes(vaultKey);
  }
}
