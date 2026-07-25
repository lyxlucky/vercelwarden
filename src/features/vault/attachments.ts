"use client";

import { decryptWithUserKey, encryptWithUserKey, wipeBytes } from "@/lib/client/crypto/auth";
import { authSecretStore } from "@/features/auth/secret-store";
import { sessionStore } from "@/lib/client/state/session-store";
import { refreshVaultFromServer } from "@/features/vault/api";
import { apiClient } from "@/lib/client/api/client";

export type AttachmentTransferPhase = "encrypting" | "uploading" | "downloading" | "decrypting" | "complete";

export interface AttachmentTransferProgress {
  phase: AttachmentTransferPhase;
  loaded: number;
  total: number;
  percent: number;
}

function report(
  callback: ((progress: AttachmentTransferProgress) => void) | undefined,
  phase: AttachmentTransferPhase,
  loaded: number,
  total: number
) {
  callback?.({ phase, loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : phase === "complete" ? 100 : 0 });
}

function uploadRequest(url: string, body: XMLHttpRequestBodyInit, headers: Record<string, string>, onProgress?: (progress: AttachmentTransferProgress) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    const token = sessionStore.getAccessToken();
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => report(onProgress, "uploading", event.loaded, event.total || 1);
    request.onerror = () => reject(new Error("附件上传中断，请重试。"));
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(`附件上传失败（${request.status}）。`));
    request.send(body);
  });
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function uploadEncryptedAttachment(
  cipherId: string,
  file: File,
  onProgress?: (progress: AttachmentTransferProgress) => void
) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  try {
    report(onProgress, "encrypting", 0, file.size);
    const plaintext = new Uint8Array(await file.arrayBuffer());
    const encrypted = await encryptWithUserKey(plaintext, vaultKey);
    plaintext.fill(0);
    const encryptedName = await encryptWithUserKey(new TextEncoder().encode(file.name), vaultKey);
    const encryptedBytes = new TextEncoder().encode(encrypted);
    const checksum = await sha256Hex(encryptedBytes);
    report(onProgress, "encrypting", file.size, file.size);
    const pending = await apiClient<{ id: string; uploadUrl: string; uploadToken: string }>(
      `/api/ciphers/${encodeURIComponent(cipherId)}/attachment`,
      { method: "POST", body: { fileName: encryptedName, fileSize: encryptedBytes.byteLength, checksum, key: null } }
    );
    await uploadRequest(pending.uploadUrl, encryptedBytes.buffer, {
      "Content-Type": "application/octet-stream",
      "X-Attachment-Id": pending.id,
      "X-Upload-Token": pending.uploadToken,
    }, onProgress);
    wipeBytes(encryptedBytes);
    const snapshot = await refreshVaultFromServer();
    report(onProgress, "complete", file.size, file.size);
    return snapshot;
  } finally {
    wipeBytes(vaultKey);
  }
}

export async function downloadEncryptedAttachment(
  cipherId: string,
  attachment: { id: string; fileName: string; size: number },
  onProgress?: (progress: AttachmentTransferProgress) => void
) {
  const plaintext = await fetchDecryptedAttachmentBytes(cipherId, attachment, onProgress);
  try {
    const downloadBytes = new Uint8Array(plaintext.length);
    downloadBytes.set(plaintext);
    const blob = new Blob([downloadBytes.buffer]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    wipeBytes(downloadBytes);
  } finally {
    wipeBytes(plaintext);
  }
}

export async function fetchDecryptedAttachmentBytes(
  cipherId: string,
  attachment: { id: string; fileName: string; size: number },
  onProgress?: (progress: AttachmentTransferProgress) => void
) {
  const vaultKey = authSecretStore.getVaultKey();
  if (!vaultKey) throw new Error("Vault key unavailable.");
  try {
    report(onProgress, "downloading", 0, attachment.size);
    const metadata = await apiClient<{ downloadUrl: string; checksum: string | null }>(
      `/api/ciphers/${encodeURIComponent(cipherId)}/attachment/${encodeURIComponent(attachment.id)}?metadata=true`
    );
    const response = await fetch(metadata.downloadUrl, { credentials: "omit", cache: "no-store" });
    if (!response.ok) throw new Error(`附件下载失败（${response.status}）。`);
    const encrypted = await response.text();
    if (metadata.checksum) {
      const encryptedBytes = new TextEncoder().encode(encrypted);
      const checksum = await sha256Hex(encryptedBytes);
      wipeBytes(encryptedBytes);
      if (checksum !== metadata.checksum) throw new Error("附件完整性校验失败。");
    }
    report(onProgress, "downloading", attachment.size, attachment.size);
    report(onProgress, "decrypting", 0, attachment.size);
    const plaintext = await decryptWithUserKey(encrypted, vaultKey);
    report(onProgress, "complete", attachment.size, attachment.size);
    return plaintext;
  } finally {
    wipeBytes(vaultKey);
  }
}

export async function removeAttachment(cipherId: string, attachmentId: string) {
  const headers = new Headers();
  const token = sessionStore.getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api/ciphers/${encodeURIComponent(cipherId)}/attachment/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE",
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`移除附件失败（${response.status}）。`);
  return refreshVaultFromServer();
}
