"use client";

import { fetchVaultSnapshot } from "@/features/vault/api";
import { vaultStore } from "@/features/vault/store";
import { sessionStore } from "@/lib/client/state/session-store";

let activeSync: Promise<ReturnType<typeof vaultStore.getSnapshot>> | null = null;

export function syncVault(): Promise<ReturnType<typeof vaultStore.getSnapshot>> {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    sessionStore.setConnectivity("syncing");
    vaultStore.setLoading();
    try {
      const next = await fetchVaultSnapshot();
      vaultStore.replace(next.items, next.folders);
      sessionStore.setConnectivity("online");
      return vaultStore.getSnapshot();
    } catch (error) {
      const previous = vaultStore.getSnapshot();
      if (previous.items.length > 0) sessionStore.setConnectivity("stale");
      else {
        vaultStore.setError(error instanceof Error ? error.message : "Vault sync failed.");
        sessionStore.setConnectivity("degraded");
      }
      throw error;
    } finally {
      activeSync = null;
    }
  })();
  return activeSync;
}
