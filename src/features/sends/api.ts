"use client";

import { apiClient } from "@/lib/client/api/client";
import {
  decryptTextWithUserKey,
  decryptWithUserKey,
  encryptWithUserKey,
  wipeBytes,
} from "@/lib/client/crypto/auth";
import { authSecretStore } from "@/features/auth/secret-store";
import { sessionStore } from "@/lib/client/state/session-store";

interface WireSendFile {
  id: string;
  fileName: string;
  size: string;
  key?: string | null;
  checksum?: string | null;
  downloadToken?: string;
}

interface WireSend {
  id: string;
  accessId: string;
  type: 0 | 1;
  name: string;
  notes: string | null;
  text: { text?: string; hidden?: boolean } | null;
  file: WireSendFile | null;
  key: string;
  maxAccessCount: number | null;
  accessCount: number;
  authType: number;
  disabled: boolean;
  hideEmail: boolean;
  revisionDate: string;
  expirationDate: string | null;
  deletionDate: string;
}

export interface SendView {
  id: string;
  accessId: string;
  type: 0 | 1;
  name: string;
  notes: string;
  text: string;
  file: { id: string; fileName: string; size: number } | null;
  url: string;
  accessCount: number;
  maxAccessCount: number | null;
  disabled: boolean;
  hideEmail: boolean;
  expirationDate: string | null;
  deletionDate: string;
}

export interface SendTransferProgress {
  phase: "encrypting" | "uploading" | "downloading" | "decrypting" | "complete";
  loaded: number;
  total: number;
  percent: number;
}

function report(callback: ((progress: SendTransferProgress) => void) | undefined, phase: SendTransferProgress["phase"], loaded: number, total: number) {
  callback?.({ phase, loaded, total, percent: total > 0 ? Math.round(loaded / total * 100) : phase === "complete" ? 100 : 0 });
}

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function decryptSend(send: WireSend, vaultKey: Uint8Array): Promise<SendView> {
  const sendKey = await decryptWithUserKey(send.key, vaultKey);
  try {
    return {
      id: send.id,
      accessId: send.accessId,
      type: send.type,
      name: await decryptTextWithUserKey(send.name, sendKey),
      notes: send.notes ? await decryptTextWithUserKey(send.notes, sendKey) : "",
      text: send.text?.text ? await decryptTextWithUserKey(send.text.text, sendKey) : "",
      file: send.file ? {
        id: send.file.id,
        fileName: await decryptTextWithUserKey(send.file.fileName, sendKey),
        size: Number(send.file.size),
      } : null,
      url: `${window.location.origin}/send/${encodeURIComponent(send.accessId)}#${base64url(sendKey)}`,
      accessCount: send.accessCount,
      maxAccessCount: send.maxAccessCount,
      disabled: send.disabled,
      hideEmail: send.hideEmail,
      expirationDate: send.expirationDate,
      deletionDate: send.deletionDate,
    };
  } finally {
    wipeBytes(sendKey);
  }
}

export async function listSends() {
  const response = await apiClient<{ data: WireSend[] }>("/api/sends");
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  try { return await Promise.all(response.data.map((send) => decryptSend(send, vaultKey))); }
  finally { wipeBytes(vaultKey); }
}

interface CreateSendInput {
  name: string;
  notes?: string;
  password?: string;
  maxAccessCount?: number | null;
  expirationDate?: string | null;
  deletionDate: string;
  disabled?: boolean;
  hideEmail?: boolean;
}

async function encryptedEnvelope(input: CreateSendInput, sendKey: Uint8Array, vaultKey: Uint8Array) {
  const encoder = new TextEncoder();
  return {
    key: await encryptWithUserKey(sendKey, vaultKey),
    name: await encryptWithUserKey(encoder.encode(input.name), sendKey),
    notes: input.notes ? await encryptWithUserKey(encoder.encode(input.notes), sendKey) : null,
    password: input.password || null,
    maxAccessCount: input.maxAccessCount ?? null,
    expirationDate: input.expirationDate ?? null,
    deletionDate: input.deletionDate,
    disabled: Boolean(input.disabled),
    hideEmail: Boolean(input.hideEmail),
  };
}

export async function createTextSend(input: CreateSendInput & { text: string }) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  const sendKey = crypto.getRandomValues(new Uint8Array(64));
  try {
    const wire = await apiClient<WireSend>("/api/sends", { method: "POST", body: {
      type: 0,
      ...await encryptedEnvelope(input, sendKey, vaultKey),
      text: { text: await encryptWithUserKey(new TextEncoder().encode(input.text), sendKey), hidden: false },
    } });
    return decryptSend(wire, vaultKey);
  } finally {
    wipeBytes(sendKey);
    wipeBytes(vaultKey);
  }
}

function uploadFile(url: string, bytes: ArrayBuffer, headers: Record<string, string>, onProgress?: (progress: SendTransferProgress) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    const token = sessionStore.getAccessToken();
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => report(onProgress, "uploading", event.loaded, event.total || bytes.byteLength);
    request.onerror = () => reject(new Error("Send 文件上传中断，请重试。"));
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(`Send 文件上传失败（${request.status}）。`));
    request.send(bytes);
  });
}

export async function createFileSend(input: CreateSendInput & { file: File }, onProgress?: (progress: SendTransferProgress) => void) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  const sendKey = crypto.getRandomValues(new Uint8Array(64));
  try {
    report(onProgress, "encrypting", 0, input.file.size);
    const plaintext = new Uint8Array(await input.file.arrayBuffer());
    const encrypted = await encryptWithUserKey(plaintext, sendKey);
    plaintext.fill(0);
    const encryptedBytes = new TextEncoder().encode(encrypted);
    const encryptedName = await encryptWithUserKey(new TextEncoder().encode(input.file.name), sendKey);
    const checksum = await sha256Hex(encryptedBytes);
    report(onProgress, "encrypting", input.file.size, input.file.size);
    const pending = await apiClient<{ send: WireSend; sendId: string; fileId: string; uploadUrl: string; uploadToken: string }>("/api/sends/file", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: {
        type: 1,
        ...await encryptedEnvelope(input, sendKey, vaultKey),
        file: { fileName: encryptedName, size: encryptedBytes.byteLength, checksum, key: null },
      },
    });
    await uploadFile(pending.uploadUrl, encryptedBytes.buffer, {
      "X-Send-Id": pending.sendId,
      "X-File-Id": pending.fileId,
      "X-Upload-Token": pending.uploadToken,
    }, onProgress);
    wipeBytes(encryptedBytes);
    report(onProgress, "complete", input.file.size, input.file.size);
    const sends = await listSends();
    return sends.find((send) => send.id === pending.sendId) ?? decryptSend(pending.send, vaultKey);
  } finally {
    wipeBytes(sendKey);
    wipeBytes(vaultKey);
  }
}

export async function updateSend(id: string, input: Partial<CreateSendInput> & { name?: string; notes?: string }) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  try {
    const wire = await apiClient<WireSend>(`/api/sends/${encodeURIComponent(id)}`);
    const sendKey = await decryptWithUserKey(wire.key, vaultKey);
    try {
      const body: Record<string, unknown> = {
        maxAccessCount: input.maxAccessCount,
        expirationDate: input.expirationDate,
        deletionDate: input.deletionDate,
        disabled: input.disabled,
        hideEmail: input.hideEmail,
      };
      if (input.name !== undefined) body.name = await encryptWithUserKey(new TextEncoder().encode(input.name), sendKey);
      if (input.notes !== undefined) body.notes = input.notes ? await encryptWithUserKey(new TextEncoder().encode(input.notes), sendKey) : null;
      await apiClient(`/api/sends/${encodeURIComponent(id)}`, { method: "PUT", body });
    } finally { wipeBytes(sendKey); }
    return listSends();
  } finally { wipeBytes(vaultKey); }
}

export async function deleteSend(id: string) {
  await apiClient(`/api/sends/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function deleteSends(ids: string[]) {
  return apiClient<{ succeeded: number; failed: number; outcomes: Array<{ id: string; status: string; code?: string }> }>("/api/sends", {
    method: "DELETE",
    body: { ids },
  });
}

export type PublicSend =
  | { type: "text"; name: string; text: string }
  | { type: "file"; name: string; file: { id: string; fileName: string; size: number; downloadToken: string; checksum: string | null }; sendKey: Uint8Array };

export async function accessPublicSend(accessId: string, fragment: string, password?: string): Promise<PublicSend> {
  const sendKey = fromBase64url(fragment);
  if (sendKey.length !== 64) throw new Error("分享链接缺少有效解密密钥。");
  const response = await fetch(`/api/sends/access/${encodeURIComponent(accessId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password || undefined }),
    cache: "no-store",
  });
  if (!response.ok) {
    wipeBytes(sendKey);
    throw new Error(response.status === 401 ? "访问密码不正确。" : "分享已过期、停用或达到访问次数上限。");
  }
  const send = await response.json() as { type: number; name: string; text?: { text?: string }; file?: WireSendFile };
  const name = await decryptTextWithUserKey(send.name, sendKey);
  if (send.type === 0) {
    try {
      return { type: "text", name, text: send.text?.text ? await decryptTextWithUserKey(send.text.text, sendKey) : "" };
    } finally { wipeBytes(sendKey); }
  }
  if (!send.file?.id || !send.file.downloadToken) {
    wipeBytes(sendKey);
    throw new Error("分享文件不可用。");
  }
  return {
    type: "file",
    name,
    file: {
      id: send.file.id,
      fileName: await decryptTextWithUserKey(send.file.fileName, sendKey),
      size: Number(send.file.size),
      downloadToken: send.file.downloadToken,
      checksum: send.file.checksum ?? null,
    },
    sendKey,
  };
}

export async function downloadPublicSendFile(accessId: string, send: Extract<PublicSend, { type: "file" }>, onProgress?: (progress: SendTransferProgress) => void) {
  try {
    report(onProgress, "downloading", 0, send.file.size);
    const authorization = await fetch(`/api/sends/access/${encodeURIComponent(accessId)}/file/${encodeURIComponent(send.file.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadToken: send.file.downloadToken }),
      cache: "no-store",
    });
    if (!authorization.ok) throw new Error("文件下载授权已失效。");
    const metadata = await authorization.json() as { url: string; checksum: string | null };
    const response = await fetch(metadata.url, { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`文件下载失败（${response.status}）。`);
    const encrypted = await response.text();
    const encryptedBytes = new TextEncoder().encode(encrypted);
    if (metadata.checksum && await sha256Hex(encryptedBytes) !== metadata.checksum) throw new Error("文件完整性校验失败。");
    report(onProgress, "downloading", send.file.size, send.file.size);
    report(onProgress, "decrypting", 0, send.file.size);
    const plaintext = await decryptWithUserKey(encrypted, send.sendKey);
    const downloadBytes = new Uint8Array(plaintext);
    const url = URL.createObjectURL(new Blob([downloadBytes.buffer]));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = send.file.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    wipeBytes(encryptedBytes);
    wipeBytes(plaintext);
    wipeBytes(downloadBytes);
    report(onProgress, "complete", send.file.size, send.file.size);
  } finally {
    wipeBytes(send.sendKey);
  }
}
