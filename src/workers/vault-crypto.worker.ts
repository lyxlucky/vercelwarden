import { argon2idAsync } from "@noble/hashes/argon2.js";

export type VaultCryptoRequest =
  | {
      id: string;
      operation: "derive-key";
      algorithm: "pbkdf2";
      password: ArrayBuffer;
      salt: ArrayBuffer;
      iterations: number;
      length: number;
    }
  | {
      id: string;
      operation: "derive-key";
      algorithm: "argon2id";
      password: ArrayBuffer;
      salt: ArrayBuffer;
      iterations: number;
      memoryKiB: number;
      parallelism: number;
      length: number;
    }
  | {
      id: string;
      operation: "decrypt-aes-gcm";
      key: ArrayBuffer;
      iv: ArrayBuffer;
      ciphertext: ArrayBuffer;
      additionalData?: ArrayBuffer;
    }
  | { id: string; operation: "cancel"; targetId: string };

export type VaultCryptoResponse =
  | { id: string; status: "progress"; progress: number }
  | { id: string; status: "complete"; result: ArrayBuffer }
  | { id: string; status: "cancelled" }
  | { id: string; status: "error"; code: string; message: string };

interface CryptoWorkerScope {
  postMessage(message: VaultCryptoResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<VaultCryptoRequest>) => void) | null;
}

const cancelled = new Set<string>();

export function wipeBuffer(buffer: ArrayBuffer | undefined) {
  if (buffer && buffer.byteLength > 0) new Uint8Array(buffer).fill(0);
}

function assertActive(id: string) {
  if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError");
}

async function deriveKey(
  request: Extract<VaultCryptoRequest, { operation: "derive-key" }>,
  scope: CryptoWorkerScope
): Promise<ArrayBuffer> {
  const password = new Uint8Array(request.password);
  const salt = new Uint8Array(request.salt);
  if (request.algorithm === "pbkdf2") {
    const sourceKey = await crypto.subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
    assertActive(request.id);
    return crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: request.iterations },
      sourceKey,
      request.length * 8
    );
  }

  const result = await argon2idAsync(password, salt, {
    t: request.iterations,
    m: request.memoryKiB,
    p: request.parallelism,
    dkLen: request.length,
    asyncTick: 20,
    onProgress(progress) {
      assertActive(request.id);
      scope.postMessage({ id: request.id, status: "progress", progress });
    },
  });
  assertActive(request.id);
  return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
}

async function decrypt(
  request: Extract<VaultCryptoRequest, { operation: "decrypt-aes-gcm" }>
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", request.key, { name: "AES-GCM" }, false, ["decrypt"]);
  assertActive(request.id);
  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: request.iv,
      additionalData: request.additionalData,
    },
    key,
    request.ciphertext
  );
}

function wipeRequest(request: VaultCryptoRequest) {
  if (request.operation === "derive-key") {
    wipeBuffer(request.password);
    wipeBuffer(request.salt);
  } else if (request.operation === "decrypt-aes-gcm") {
    wipeBuffer(request.key);
    wipeBuffer(request.iv);
    wipeBuffer(request.ciphertext);
    wipeBuffer(request.additionalData);
  }
}

async function handleRequest(request: VaultCryptoRequest, scope: CryptoWorkerScope) {
  if (request.operation === "cancel") {
    cancelled.add(request.targetId);
    scope.postMessage({ id: request.targetId, status: "cancelled" });
    return;
  }

  try {
    const result =
      request.operation === "derive-key"
        ? await deriveKey(request, scope)
        : await decrypt(request);
    assertActive(request.id);
    scope.postMessage({ id: request.id, status: "complete", result }, [result]);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      scope.postMessage({ id: request.id, status: "cancelled" });
    } else {
      scope.postMessage({
        id: request.id,
        status: "error",
        code: "crypto_operation_failed",
        message: error instanceof Error ? error.message : "Cryptographic operation failed.",
      });
    }
  } finally {
    wipeRequest(request);
    cancelled.delete(request.id);
  }
}

if (typeof self !== "undefined" && typeof document === "undefined") {
  const scope = self as unknown as CryptoWorkerScope;
  scope.onmessage = (event) => void handleRequest(event.data, scope);
}
