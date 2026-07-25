"use client";

import { wipeBytes } from "@/lib/client/crypto/auth";

let masterKey: Uint8Array | null = null;
let vaultKey: Uint8Array | null = null;

function replace(current: Uint8Array | null, next: Uint8Array | null): Uint8Array | null {
  wipeBytes(current ?? undefined);
  return next?.slice() ?? null;
}

export const authSecretStore = {
  set(input: { masterKey?: Uint8Array | null; vaultKey?: Uint8Array | null }) {
    if ("masterKey" in input) masterKey = replace(masterKey, input.masterKey ?? null);
    if ("vaultKey" in input) vaultKey = replace(vaultKey, input.vaultKey ?? null);
  },
  getMasterKey() {
    return masterKey?.slice() ?? null;
  },
  getVaultKey() {
    return vaultKey?.slice() ?? null;
  },
  hasVaultKey() {
    return vaultKey !== null;
  },
  clearDecryptionMaterial() {
    masterKey = replace(masterKey, null);
    vaultKey = replace(vaultKey, null);
  },
};
