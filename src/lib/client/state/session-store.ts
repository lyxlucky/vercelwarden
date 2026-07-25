"use client";

import { useSyncExternalStore } from "react";
import { CAPABILITY_KEYS, type CapabilityMap } from "@/lib/contracts/capabilities";

export type SessionPhase =
  | "bootstrapping"
  | "anonymous"
  | "locked"
  | "unlocked"
  | "locked-offline"
  | "unlocked-offline";
export type ConnectivityState = "online" | "syncing" | "degraded" | "offline" | "stale" | "reauth-required";
export type SessionRole = "user" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  roles: SessionRole[];
}

export interface SessionSnapshot {
  phase: SessionPhase;
  online: boolean;
  connectivity: ConnectivityState;
  readOnly: boolean;
  user: SessionUser | null;
  capabilities: CapabilityMap;
}

const unavailableCapabilities = Object.fromEntries(
  CAPABILITY_KEYS.map((key) => [key, false])
) as CapabilityMap;

let accessToken: string | null = null;
let snapshot: SessionSnapshot = {
  phase: "bootstrapping",
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  connectivity: typeof navigator === "undefined" || navigator.onLine ? "online" : "offline",
  readOnly: false,
  user: null,
  capabilities: unavailableCapabilities,
};
const listeners = new Set<() => void>();

function publish(next: SessionSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function update(patch: Partial<SessionSnapshot>) {
  publish({ ...snapshot, ...patch });
}

export const sessionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot() {
    return snapshot;
  },

  getServerSnapshot() {
    return snapshot;
  },

  getAccessToken() {
    return accessToken;
  },

  setAnonymous() {
    accessToken = null;
    update({ phase: "anonymous", user: null, readOnly: false });
  },

  authenticate(input: {
    accessToken: string;
    user: SessionUser;
    capabilities?: CapabilityMap;
    unlocked?: boolean;
  }) {
    accessToken = input.accessToken;
    update({
      phase: input.unlocked ? "unlocked" : "locked",
      connectivity: "online",
      online: true,
      readOnly: false,
      user: input.user,
      capabilities: input.capabilities ?? snapshot.capabilities,
    });
  },

  setCapabilities(capabilities: CapabilityMap) {
    update({ capabilities });
  },

  lock() {
    if (snapshot.phase === "unlocked") update({ phase: "locked" });
    if (snapshot.phase === "unlocked-offline") update({ phase: "locked-offline", readOnly: true });
  },

  unlock() {
    if (snapshot.phase === "locked") update({ phase: "unlocked" });
  },

  setOfflineAvailable(user: SessionUser) {
    accessToken = null;
    update({
      phase: "locked-offline",
      online: false,
      connectivity: "offline",
      readOnly: true,
      user,
    });
  },

  unlockOffline(user?: SessionUser) {
    if (snapshot.phase !== "locked-offline" && snapshot.phase !== "bootstrapping") return;
    update({
      phase: "unlocked-offline",
      online: false,
      connectivity: "offline",
      readOnly: true,
      user: user ?? snapshot.user,
    });
  },

  setOnline(online: boolean) {
    if (snapshot.online !== online || (!online && snapshot.connectivity !== "offline")) {
      update({ online, connectivity: online ? snapshot.connectivity : "offline" });
    }
  },

  setConnectivity(connectivity: ConnectivityState) {
    update({
      connectivity,
      online: connectivity === "online" || connectivity === "syncing",
    });
  },

  logout() {
    accessToken = null;
    publish({
      phase: "anonymous",
      online: snapshot.online,
      connectivity: snapshot.online ? "online" : "offline",
      readOnly: false,
      user: null,
      capabilities: unavailableCapabilities,
    });
  },
};

export function isUnlockedPhase(phase: SessionPhase): boolean {
  return phase === "unlocked" || phase === "unlocked-offline";
}

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot
  );
}
