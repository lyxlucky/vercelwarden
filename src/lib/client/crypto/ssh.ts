"use client";

export interface GeneratedSshKeyPair {
  algorithm: "ed25519";
  privateKey: string;
  publicKey: string;
  fingerprint: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function pem(label: string, bytes: Uint8Array): string {
  const base64 = bytesToBase64(bytes);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function concatenate(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function sshString(bytes: Uint8Array): Uint8Array {
  return concatenate(uint32(bytes.length), bytes);
}

export async function generateSshKeyPair(comment = "vercelwarden"): Promise<GeneratedSshKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  ) as CryptoKeyPair;
  const [rawPublic, pkcs8Private] = await Promise.all([
    crypto.subtle.exportKey("raw", pair.publicKey),
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
  ]);
  const algorithm = new TextEncoder().encode("ssh-ed25519");
  const publicBlob = concatenate(sshString(algorithm), sshString(new Uint8Array(rawPublic)));
  const digestInput = new Uint8Array(publicBlob.length);
  digestInput.set(publicBlob);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput));
  return {
    algorithm: "ed25519",
    privateKey: pem("PRIVATE KEY", new Uint8Array(pkcs8Private)),
    publicKey: `ssh-ed25519 ${bytesToBase64(publicBlob)} ${comment.trim() || "vercelwarden"}`,
    fingerprint: `SHA256:${bytesToBase64(digest).replace(/=+$/, "")}`,
  };
}
