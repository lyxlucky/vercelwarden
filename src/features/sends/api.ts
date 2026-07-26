"use client";

import { apiClient } from "@/lib/client/api/client";
import { upload } from "@vercel/blob/client";
import {
  decryptBinaryBytes,
  decryptTextWithUserKey,
  decryptWithUserKey,
  encryptBytesToBinary,
  encryptWithUserKey,
  wipeBytes,
} from "@/lib/client/crypto/auth";
import { authSecretStore } from "@/features/auth/secret-store";
import { deriveSendContentKey } from "@/features/sends/crypto";
import { sessionStore } from "@/lib/client/state/session-store";

interface WireSendFile {
  id: string;
  fileName: string;
  size: string;
  plaintextSize?: number | null;
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
  const sendKeyMaterial = await decryptWithUserKey(send.key, vaultKey);
  let contentKey: Uint8Array | undefined;
  try {
    contentKey = await deriveSendContentKey(sendKeyMaterial);
    return {
      id: send.id,
      accessId: send.accessId,
      type: send.type,
      name: await decryptTextWithUserKey(send.name, contentKey),
      notes: send.notes ? await decryptTextWithUserKey(send.notes, contentKey) : "",
      text: send.text?.text ? await decryptTextWithUserKey(send.text.text, contentKey) : "",
      file: send.file ? {
        id: send.file.id,
        fileName: await decryptTextWithUserKey(send.file.fileName, contentKey),
        size: Number(send.file.size),
      } : null,
      url: `${window.location.origin}/send/${encodeURIComponent(send.accessId)}#${base64url(sendKeyMaterial)}`,
      accessCount: send.accessCount,
      maxAccessCount: send.maxAccessCount,
      disabled: send.disabled,
      hideEmail: send.hideEmail,
      expirationDate: send.expirationDate,
      deletionDate: send.deletionDate,
    };
  } finally {
    wipeBytes(contentKey);
    wipeBytes(sendKeyMaterial);
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

async function encryptedEnvelope(input: CreateSendInput, sendKeyMaterial: Uint8Array, contentKey: Uint8Array, vaultKey: Uint8Array) {
  const encoder = new TextEncoder();
  return {
    key: await encryptWithUserKey(sendKeyMaterial, vaultKey),
    name: await encryptWithUserKey(encoder.encode(input.name), contentKey),
    notes: input.notes ? await encryptWithUserKey(encoder.encode(input.notes), contentKey) : null,
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
  const sendKeyMaterial = crypto.getRandomValues(new Uint8Array(16));
  let contentKey: Uint8Array | undefined;
  try {
    contentKey = await deriveSendContentKey(sendKeyMaterial);
    const wire = await apiClient<WireSend>("/api/sends", { method: "POST", body: {
      type: 0,
      ...await encryptedEnvelope(input, sendKeyMaterial, contentKey, vaultKey),
      text: { text: await encryptWithUserKey(new TextEncoder().encode(input.text), contentKey), hidden: false },
    } });
    return await decryptSend(wire, vaultKey);
  } finally {
    wipeBytes(contentKey);
    wipeBytes(sendKeyMaterial);
    wipeBytes(vaultKey);
  }
}

export async function createFileSend(input: CreateSendInput & { file: File }, onProgress?: (progress: SendTransferProgress) => void) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  const sendKeyMaterial = crypto.getRandomValues(new Uint8Array(16));
  let contentKey: Uint8Array | undefined;
  let binary: Uint8Array<ArrayBuffer> | undefined;
  let pendingSendId: string | undefined;
  let confirmed = false;
  try {
    contentKey = await deriveSendContentKey(sendKeyMaterial);
    report(onProgress, "encrypting", 0, input.file.size);
    const plaintext = new Uint8Array(await input.file.arrayBuffer());
    binary = await encryptBytesToBinary(plaintext, contentKey);
    plaintext.fill(0);
    const encryptedName = await encryptWithUserKey(new TextEncoder().encode(input.file.name), contentKey);
    const checksum = await sha256Hex(binary);
    report(onProgress, "encrypting", input.file.size, input.file.size);
    // 1. Reserve a pending Send + file row and get the pinned upload path/token.
    const pending = await apiClient<{ send: WireSend; sendId: string; fileId: string; pathname: string; uploadToken: string }>("/api/sends/file", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: {
        type: 1,
        ...await encryptedEnvelope(input, sendKeyMaterial, contentKey, vaultKey),
        file: { fileName: encryptedName, size: binary.byteLength, plaintextSize: input.file.size, checksum, key: null },
      },
    });
    pendingSendId = pending.sendId;
    // 2. Upload the encrypted bytes straight to Blob storage, bypassing the
    //    ~4.5MB serverless body limit; the token route authorizes this path.
    const token = sessionStore.getAccessToken();
    await upload(pending.pathname, new Blob([binary]), {
      access: "private",
      handleUploadUrl: "/api/sends/file/upload-token",
      multipart: true,
      contentType: "application/octet-stream",
      clientPayload: JSON.stringify({ sendId: pending.sendId, fileId: pending.fileId, uploadToken: pending.uploadToken }),
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      onUploadProgress: (event) => report(onProgress, "uploading", event.loaded, event.total),
    });
    // 3. Confirm — the server head()s the blob and flips the row to complete.
    const confirm = await apiClient<{ send: WireSend }>("/api/sends/file", { method: "PUT", body: { sendId: pending.sendId, fileId: pending.fileId } });
    confirmed = true;
    report(onProgress, "complete", input.file.size, input.file.size);
    return await decryptSend(confirm.send, vaultKey);
  } catch (error) {
    // Roll back ONLY before the upload is confirmed. Once confirmed the Send is
    // fully created — a later failure must never delete it.
    if (pendingSendId && !confirmed) {
      await apiClient(`/api/sends/${encodeURIComponent(pendingSendId)}`, { method: "DELETE" }).catch(() => undefined);
    }
    throw error;
  } finally {
    wipeBytes(binary);
    wipeBytes(contentKey);
    wipeBytes(sendKeyMaterial);
    wipeBytes(vaultKey);
  }
}

export async function updateSend(
  id: string,
  input: {
    name?: string;
    notes?: string;
    maxAccessCount?: number | null;
    expirationDate?: string | null;
    deletionDate?: string;
    disabled?: boolean;
    hideEmail?: boolean;
    // string sets a new access password; null clears it; undefined leaves it.
    password?: string | null;
  }
) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  try {
    const body: Record<string, unknown> = {
      maxAccessCount: input.maxAccessCount,
      expirationDate: input.expirationDate,
      deletionDate: input.deletionDate,
      disabled: input.disabled,
      hideEmail: input.hideEmail,
      password: input.password,
    };
    // Re-encrypting name/notes needs the Send's content key; only fetch it when
    // those actually change (metadata-only edits skip the extra round-trip).
    if (input.name !== undefined || input.notes !== undefined) {
      const wire = await apiClient<WireSend>(`/api/sends/${encodeURIComponent(id)}`);
      const sendKeyMaterial = await decryptWithUserKey(wire.key, vaultKey);
      let contentKey: Uint8Array | undefined;
      try {
        contentKey = await deriveSendContentKey(sendKeyMaterial);
        if (input.name !== undefined) body.name = await encryptWithUserKey(new TextEncoder().encode(input.name), contentKey);
        if (input.notes !== undefined) body.notes = input.notes ? await encryptWithUserKey(new TextEncoder().encode(input.notes), contentKey) : null;
      } finally {
        wipeBytes(contentKey);
        wipeBytes(sendKeyMaterial);
      }
    }
    const updated = await apiClient<WireSend>(`/api/sends/${encodeURIComponent(id)}`, { method: "PUT", body });
    return await decryptSend(updated, vaultKey);
  } finally {
    wipeBytes(vaultKey);
  }
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
  | { type: "file"; name: string; file: { id: string; fileName: string; size: number; checksum: string | null; encoding: "binary" | "legacy" }; sendKey: Uint8Array };

export type PublicSendAccessErrorCode = "password_required" | "invalid_password" | "unavailable";

export class PublicSendAccessError extends Error {
  constructor(public readonly code: PublicSendAccessErrorCode, message: string) {
    super(message);
    this.name = "PublicSendAccessError";
  }
}

export async function accessPublicSend(accessId: string, fragment: string, password?: string): Promise<PublicSend> {
  const sendKeyMaterial = fromBase64url(fragment);
  if (sendKeyMaterial.length === 0) throw new Error("分享链接缺少有效解密密钥。");
  let contentKey: Uint8Array | undefined;
  let retainContentKey = false;
  try {
    contentKey = await deriveSendContentKey(sendKeyMaterial);
    const response = await fetch(`/api/sends/access/${encodeURIComponent(accessId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password || undefined }),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 401) {
        throw new PublicSendAccessError(
          password ? "invalid_password" : "password_required",
          password ? "访问密码不正确，请重试。" : "此分享受密码保护。"
        );
      }
      throw new PublicSendAccessError("unavailable", "分享已过期、停用或达到访问次数上限。");
    }
    const send = await response.json() as { type: number; name: string; text?: { text?: string }; file?: WireSendFile };
    const name = await decryptTextWithUserKey(send.name, contentKey);
    if (send.type === 0) {
      const text = send.text?.text ? await decryptTextWithUserKey(send.text.text, contentKey) : "";
      return { type: "text", name, text };
    }
    if (!send.file?.id) throw new Error("分享文件不可用。");
    const fileName = await decryptTextWithUserKey(send.file.fileName, contentKey);
    retainContentKey = true;
    return {
      type: "file",
      name,
      file: {
        id: send.file.id,
        fileName,
        size: Number(send.file.size),
        checksum: send.file.checksum ?? null,
        // New Sends carry plaintextSize and use the raw-binary body; legacy /
        // official-client Sends (no plaintextSize) are base64 cipher strings.
        encoding: send.file.plaintextSize != null ? "binary" : "legacy",
      },
      sendKey: contentKey,
    };
  } finally {
    wipeBytes(sendKeyMaterial);
    if (!retainContentKey) wipeBytes(contentKey);
  }
}

export async function downloadPublicSendFile(accessId: string, send: Extract<PublicSend, { type: "file" }>, password?: string, onProgress?: (progress: SendTransferProgress) => void) {
  try {
    report(onProgress, "downloading", 0, send.file.size);
    const authorization = await fetch(`/api/sends/access/${encodeURIComponent(accessId)}/file/${encodeURIComponent(send.file.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password || undefined }),
      cache: "no-store",
    });
    if (!authorization.ok) throw new Error("文件下载授权已失效。");
    const metadata = await authorization.json() as { url: string; checksum: string | null };
    const response = await fetch(metadata.url, { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`文件下载失败（${response.status}）。`);
    const encryptedBytes = new Uint8Array(await response.arrayBuffer());
    if (metadata.checksum && await sha256Hex(encryptedBytes) !== metadata.checksum) throw new Error("文件完整性校验失败。");
    report(onProgress, "downloading", send.file.size, send.file.size);
    report(onProgress, "decrypting", 0, send.file.size);
    const plaintext = send.file.encoding === "legacy"
      ? await decryptWithUserKey(new TextDecoder().decode(encryptedBytes), send.sendKey)
      : await decryptBinaryBytes(encryptedBytes, send.sendKey);
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
