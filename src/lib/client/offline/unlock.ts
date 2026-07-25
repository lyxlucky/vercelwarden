"use client";

import { deriveMasterKey, unwrapVaultKey, wipeBytes } from "@/lib/client/crypto/auth";
import { vaultCache, type EncryptedVaultSnapshotRecord } from "@/lib/client/offline/vault-cache";
import { sessionStore, type SessionUser } from "@/lib/client/state/session-store";
import { authSecretStore } from "@/features/auth/secret-store";
import { materializeVaultSnapshot, validateSyncResponse } from "@/features/vault/api";
import { vaultStore } from "@/features/vault/store";

const encoder = new TextEncoder();

function deviceIdentifier(): string | null {
  return localStorage.getItem("vercelwarden.device-id");
}

function snapshotUser(record: EncryptedVaultSnapshotRecord): SessionUser {
  const sync = validateSyncResponse(record.encryptedSyncPayload);
  const profile = sync.profile;
  if (!profile || profile.id !== record.userUuid || typeof profile.email !== "string") {
    throw new Error("Offline snapshot account binding is invalid.");
  }
  return {
    id: record.userUuid,
    email: profile.email,
    name: typeof profile.name === "string" ? profile.name : undefined,
    roles: ["user"],
  };
}

export async function discoverOfflineAccount(): Promise<SessionUser | null> {
  const device = deviceIdentifier();
  if (!device) {
    console.warn("Offline snapshot device binding is unavailable");
    return null;
  }
  const record = await vaultCache.findForDevice(window.location.origin, device);
  if (!record) console.warn("Offline snapshot was not found for this origin and device");
  return record ? snapshotUser(record) : null;
}

export async function unlockOfflineVault(password: string): Promise<void> {
  const device = deviceIdentifier();
  if (!device) throw new Error("This browser has no offline device binding.");
  const currentUser = sessionStore.getSnapshot().user;
  const record = currentUser
    ? await vaultCache.load({ origin: window.location.origin, userUuid: currentUser.id, deviceIdentifier: device })
    : await vaultCache.findForDevice(window.location.origin, device);
  if (!record) throw new Error("No complete offline vault snapshot is available.");
  const user = snapshotUser(record);
  const sync = validateSyncResponse(record.encryptedSyncPayload);
  const saltValue = sync.userDecryption?.masterPasswordUnlock?.salt ?? user.email;
  const passwordBytes = encoder.encode(password);
  const salt = encoder.encode(saltValue.normalize("NFKC").trim().toLowerCase());
  let masterKey: Uint8Array | null = null;
  let vaultKey: Uint8Array | null = null;
  try {
    masterKey = await deriveMasterKey(record.kdf.type === 1
      ? {
          algorithm: "argon2id",
          password: passwordBytes,
          salt,
          iterations: record.kdf.iterations,
          memoryKiB: (record.kdf.memory ?? 64) * 1024,
          parallelism: record.kdf.parallelism ?? 4,
        }
      : {
          algorithm: "pbkdf2",
          password: passwordBytes,
          salt,
          iterations: record.kdf.iterations,
        });
    vaultKey = await unwrapVaultKey(record.encryptedUserKey, masterKey);
    const view = await materializeVaultSnapshot(sync, vaultKey);
    authSecretStore.set({ masterKey, vaultKey });
    vaultStore.replace(view.items, view.folders);
    sessionStore.unlockOffline(user);
  } finally {
    wipeBytes(passwordBytes);
    wipeBytes(salt);
    wipeBytes(masterKey ?? undefined);
    wipeBytes(vaultKey ?? undefined);
  }
}
