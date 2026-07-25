import "client-only";
import { argon2idAsync } from "@noble/hashes/argon2.js";

export type MasterKeyParameters =
  | {
      algorithm: "pbkdf2";
      password: Uint8Array;
      salt: Uint8Array;
      iterations: number;
      length?: number;
    }
  | {
      algorithm: "argon2id";
      password: Uint8Array;
      salt: Uint8Array;
      iterations: number;
      memoryKiB: number;
      parallelism: number;
      length?: number;
    };

export interface DecodedCipherString {
  type: 2;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
  mac: Uint8Array<ArrayBuffer>;
}

const encoder = new TextEncoder();

function owned(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}

export function wipeBytes(bytes: Uint8Array | undefined): void {
  bytes?.fill(0);
}

export async function deriveMasterKey(parameters: MasterKeyParameters): Promise<Uint8Array> {
  const length = parameters.length ?? 32;
  if (parameters.algorithm === "argon2id") {
    const salt = new Uint8Array(await crypto.subtle.digest("SHA-256", owned(parameters.salt)));
    try {
      return await argon2idAsync(parameters.password, salt, {
        t: parameters.iterations,
        m: parameters.memoryKiB,
        p: parameters.parallelism,
        dkLen: length,
        asyncTick: 20,
      });
    } finally {
      wipeBytes(salt);
    }
  }

  const source = await crypto.subtle.importKey("raw", owned(parameters.password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: owned(parameters.salt),
      iterations: parameters.iterations,
    },
    source,
    length * 8
  );
  return new Uint8Array(bits);
}

export async function deriveMasterPasswordHash(
  masterKey: Uint8Array,
  password: Uint8Array,
  iterations = 1
): Promise<Uint8Array> {
  const source = await crypto.subtle.importKey("raw", owned(masterKey), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: owned(password), iterations },
    source,
    256
  );
  return new Uint8Array(bits);
}

async function stretchMasterKey(masterKey: Uint8Array) {
  // Bitwarden treats the KDF output as an existing PRK and performs only the
  // RFC 5869 expand step. For one SHA-256 block: T(1) = HMAC(PRK, info || 0x01).
  const source = await crypto.subtle.importKey(
    "raw",
    owned(masterKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const derive = async (label: string) => {
    const info = encoder.encode(label);
    const input = new Uint8Array(info.byteLength + 1);
    input.set(info);
    input[input.byteLength - 1] = 1;
    try {
      return new Uint8Array(await crypto.subtle.sign("HMAC", source, input));
    } finally {
      wipeBytes(info);
      wipeBytes(input);
    }
  };
  return { encryptionKey: await derive("enc"), macKey: await derive("mac") };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Invalid cipher string encoding.");
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Invalid cipher string encoding.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}

export function decodeCipherString(value: string): DecodedCipherString {
  const match = /^2\.([^|]+)\|([^|]+)\|([^|]+)$/.exec(value);
  if (!match) throw new Error("Unsupported Bitwarden cipher string.");
  const iv = fromBase64(match[1]);
  const ciphertext = fromBase64(match[2]);
  const mac = fromBase64(match[3]);
  if (iv.length !== 16 || ciphertext.length === 0 || ciphertext.length % 16 !== 0 || mac.length !== 32) {
    throw new Error("Invalid Bitwarden cipher string.");
  }
  return { type: 2, iv, ciphertext, mac };
}

export async function wrapVaultKey(
  vaultKey: Uint8Array,
  masterKey: Uint8Array,
  suppliedIv?: Uint8Array
): Promise<string> {
  const iv = suppliedIv ? owned(suppliedIv) : crypto.getRandomValues(new Uint8Array(16));
  if (iv.length !== 16) throw new Error("AES-CBC requires a 16-byte IV.");
  const stretched = await stretchMasterKey(masterKey);
  try {
    const encryptionKey = await crypto.subtle.importKey("raw", owned(stretched.encryptionKey), "AES-CBC", false, ["encrypt"]);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, encryptionKey, owned(vaultKey)));
    const signingKey = await crypto.subtle.importKey(
      "raw",
      owned(stretched.macKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, concatenate(iv, ciphertext)));
    return `2.${toBase64(iv)}|${toBase64(ciphertext)}|${toBase64(mac)}`;
  } finally {
    wipeBytes(stretched.encryptionKey);
    wipeBytes(stretched.macKey);
  }
}

export async function encryptWithUserKey(plaintext: Uint8Array, userKey: Uint8Array): Promise<string> {
  if (userKey.length !== 64) throw new Error("A Bitwarden user key must be 64 bytes.");
  const encryptionBytes = owned(userKey.subarray(0, 32));
  const macBytes = owned(userKey.subarray(32, 64));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  try {
    const encryptionKey = await crypto.subtle.importKey("raw", encryptionBytes, "AES-CBC", false, ["encrypt"]);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      encryptionKey,
      owned(plaintext)
    ));
    const signingKey = await crypto.subtle.importKey(
      "raw",
      macBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, concatenate(iv, ciphertext)));
    return `2.${toBase64(iv)}|${toBase64(ciphertext)}|${toBase64(mac)}`;
  } finally {
    wipeBytes(encryptionBytes);
    wipeBytes(macBytes);
  }
}

export async function decryptWithUserKey(value: string, userKey: Uint8Array): Promise<Uint8Array> {
  if (userKey.length !== 64) throw new Error("A Bitwarden user key must be 64 bytes.");
  const decoded = decodeCipherString(value);
  const encryptionBytes = owned(userKey.subarray(0, 32));
  const macBytes = owned(userKey.subarray(32, 64));
  try {
    const signingKey = await crypto.subtle.importKey(
      "raw",
      macBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      signingKey,
      owned(decoded.mac),
      concatenate(decoded.iv, decoded.ciphertext)
    );
    if (!valid) throw new Error("Cipher string authentication failed.");
    const encryptionKey = await crypto.subtle.importKey(
      "raw",
      encryptionBytes,
      "AES-CBC",
      false,
      ["decrypt"]
    );
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: owned(decoded.iv) },
      encryptionKey,
      owned(decoded.ciphertext)
    ));
  } finally {
    wipeBytes(encryptionBytes);
    wipeBytes(macBytes);
    wipeBytes(decoded.iv);
    wipeBytes(decoded.ciphertext);
    wipeBytes(decoded.mac);
  }
}

export async function decryptTextWithUserKey(value: string, userKey: Uint8Array): Promise<string> {
  const plaintext = await decryptWithUserKey(value, userKey);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } finally {
    wipeBytes(plaintext);
  }
}

export async function unwrapVaultKey(value: string, masterKey: Uint8Array): Promise<Uint8Array> {
  const decoded = decodeCipherString(value);
  const stretched = await stretchMasterKey(masterKey);
  try {
    const signingKey = await crypto.subtle.importKey(
      "raw",
      owned(stretched.macKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      signingKey,
      owned(decoded.mac),
      concatenate(decoded.iv, decoded.ciphertext)
    );
    if (!valid) throw new Error("Cipher string authentication failed.");
    const encryptionKey = await crypto.subtle.importKey("raw", owned(stretched.encryptionKey), "AES-CBC", false, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: owned(decoded.iv) },
      encryptionKey,
      owned(decoded.ciphertext)
    ));
  } finally {
    wipeBytes(stretched.encryptionKey);
    wipeBytes(stretched.macKey);
    wipeBytes(decoded.iv);
    wipeBytes(decoded.ciphertext);
    wipeBytes(decoded.mac);
  }
}
