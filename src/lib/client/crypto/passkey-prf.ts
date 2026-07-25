import "client-only";

import { wipeBytes } from "@/lib/client/crypto/auth";

const encoder = new TextEncoder();
const PRF_SALT_LABEL = "vercelwarden:passkey-direct-unlock:v1";
const PRF_KEY_SALT = encoder.encode("vercelwarden:passkey-prf-key:v1");
const PRF_KEY_INFO = encoder.encode("vault-key-wrapper");
const WRAPPER_PREFIX = "vw-prf.1";

function owned(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Passkey wrapper encoding is invalid.");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function passkeyPrfSalt(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(PRF_SALT_LABEL)));
}

export function addPasskeyPrfInput<T extends object>(
  options: T,
  salt: Uint8Array
): T & { extensions: Record<string, unknown> & { prf: { eval: { first: Uint8Array<ArrayBuffer> } } } } {
  const current = options as T & { extensions?: Record<string, unknown> };
  return {
    ...current,
    extensions: {
      ...current.extensions,
      prf: { eval: { first: owned(salt) } },
    },
  } as T & { extensions: Record<string, unknown> & { prf: { eval: { first: Uint8Array<ArrayBuffer> } } } };
}

export function readPasskeyPrfResult(response: unknown): Uint8Array<ArrayBuffer> | null {
  if (!response || typeof response !== "object") return null;
  const extensionResults = (response as { clientExtensionResults?: unknown }).clientExtensionResults;
  if (!extensionResults || typeof extensionResults !== "object") return null;
  const prf = (extensionResults as { prf?: unknown }).prf;
  if (!prf || typeof prf !== "object") return null;
  const results = (prf as { results?: unknown }).results;
  if (!results || typeof results !== "object") return null;
  const first = (results as { first?: unknown }).first;
  if (first instanceof ArrayBuffer) return new Uint8Array(first.slice(0));
  if (ArrayBuffer.isView(first)) {
    return owned(new Uint8Array(first.buffer, first.byteOffset, first.byteLength));
  }
  if (typeof first === "string") return fromBase64Url(first);
  return null;
}

async function deriveWrappingKey(prfResult: Uint8Array): Promise<CryptoKey> {
  const source = await crypto.subtle.importKey("raw", owned(prfResult), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: owned(PRF_KEY_SALT), info: owned(PRF_KEY_INFO) },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapVaultKeyWithPasskeyPrf(
  vaultKey: Uint8Array,
  prfResult: Uint8Array
): Promise<string> {
  if (vaultKey.length !== 64) throw new Error("A direct-unlock vault key must be 64 bytes.");
  if (prfResult.length < 32) throw new Error("The authenticator returned an invalid PRF result.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveWrappingKey(prfResult);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(WRAPPER_PREFIX) },
    key,
    owned(vaultKey)
  ));
  return `${WRAPPER_PREFIX}.${base64Url(iv)}.${base64Url(ciphertext)}`;
}

export async function unwrapVaultKeyWithPasskeyPrf(
  wrapper: string,
  prfResult: Uint8Array
): Promise<Uint8Array<ArrayBuffer>> {
  const parts = wrapper.split(".");
  if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== WRAPPER_PREFIX) {
    throw new Error("The Passkey direct-unlock wrapper is unsupported.");
  }
  const iv = fromBase64Url(parts[2]);
  const ciphertext = fromBase64Url(parts[3]);
  if (iv.length !== 12 || ciphertext.length <= 16) throw new Error("The Passkey direct-unlock wrapper is invalid.");
  const key = await deriveWrappingKey(prfResult);
  try {
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(WRAPPER_PREFIX) },
      key,
      ciphertext
    ));
    if (plaintext.length !== 64) {
      wipeBytes(plaintext);
      throw new Error("The Passkey direct-unlock key is invalid.");
    }
    return plaintext;
  } finally {
    wipeBytes(iv);
    wipeBytes(ciphertext);
  }
}
