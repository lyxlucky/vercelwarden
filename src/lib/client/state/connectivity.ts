"use client";

import { apiClient } from "@/lib/client/api/client";
import { sessionStore, isUnlockedPhase } from "@/lib/client/state/session-store";
import { refreshSession } from "@/features/auth/api";
import { authSecretStore } from "@/features/auth/secret-store";
import { syncVault } from "@/features/vault/sync-controller";
import { vaultStore } from "@/features/vault/store";

interface RevisionEvent {
  eventId: string;
  sequence: number;
  actingDeviceIdentifier?: string;
}

class ConnectivityController {
  private started = false;
  private pollingTimer: number | null = null;
  private streamAbort: AbortController | null = null;
  private unsubscribeSession: (() => void) | null = null;
  private lastRevision = 0;
  private lastSequence = 0;
  private observedPhase = "";

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener("online", this.onBrowserOnline);
    window.addEventListener("offline", this.onBrowserOffline);
    this.unsubscribeSession = sessionStore.subscribe(this.onSessionChange);
    this.pollingTimer = window.setInterval(() => void this.poll(), 45_000);
    this.onSessionChange();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener("online", this.onBrowserOnline);
    window.removeEventListener("offline", this.onBrowserOffline);
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    if (this.pollingTimer !== null) window.clearInterval(this.pollingTimer);
    this.pollingTimer = null;
    this.stopStream();
  }

  async syncNow() {
    if (!navigator.onLine) {
      sessionStore.setConnectivity("offline");
      throw new Error("The server is unavailable while offline.");
    }
    await this.ensureSession();
    if (!isUnlockedPhase(sessionStore.getSnapshot().phase)) {
      sessionStore.setConnectivity("stale");
      throw new Error("Unlock the vault before synchronizing.");
    }
    await syncVault();
    this.startStream();
  }

  private ensureSession = async () => {
    if (sessionStore.getAccessToken()) return;
    const wasOfflineUnlocked = sessionStore.getSnapshot().phase === "unlocked-offline";
    await refreshSession();
    if (wasOfflineUnlocked && authSecretStore.hasVaultKey()) sessionStore.unlock();
  };

  private poll = async () => {
    if (!this.started || !navigator.onLine || !sessionStore.getAccessToken()) return;
    try {
      const revision = await apiClient<number>("/api/accounts/revision-date");
      sessionStore.setConnectivity("online");
      if (revision > this.lastRevision) {
        this.lastRevision = revision;
        if (isUnlockedPhase(sessionStore.getSnapshot().phase)) await syncVault();
        else sessionStore.setConnectivity("stale");
      }
      this.startStream();
    } catch {
      sessionStore.setConnectivity(navigator.onLine ? "degraded" : "offline");
    }
  };

  private reconnect = async () => {
    if (!navigator.onLine) return;
    sessionStore.setConnectivity("syncing");
    try {
      await this.ensureSession();
      if (isUnlockedPhase(sessionStore.getSnapshot().phase)) await syncVault();
      else sessionStore.setConnectivity("online");
      this.startStream();
    } catch {
      authSecretStore.clearDecryptionMaterial();
      vaultStore.clear();
      const phase = sessionStore.getSnapshot().phase;
      if (phase === "unlocked-offline") sessionStore.lock();
      sessionStore.setConnectivity("reauth-required");
    }
  };

  private startStream() {
    if (this.streamAbort || !navigator.onLine) return;
    const token = sessionStore.getAccessToken();
    if (!token) return;
    const abort = new AbortController();
    this.streamAbort = abort;
    void fetch("/notifications/events", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
        ...(this.lastSequence ? { "Last-Event-ID": String(this.lastSequence) } : {}),
      },
      credentials: "include",
      cache: "no-store",
      signal: abort.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) throw new Error("Notification stream unavailable.");
      sessionStore.setConnectivity("online");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!abort.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (data) await this.handleEvent(JSON.parse(data) as RevisionEvent);
          boundary = buffer.indexOf("\n\n");
        }
      }
    }).catch(() => {
      if (!abort.signal.aborted) sessionStore.setConnectivity(navigator.onLine ? "degraded" : "offline");
    }).finally(() => {
      if (this.streamAbort === abort) this.streamAbort = null;
    });
  }

  private async handleEvent(event: RevisionEvent) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= this.lastSequence) return;
    this.lastSequence = event.sequence;
    const ownDevice = localStorage.getItem("vercelwarden.device-id");
    if (event.actingDeviceIdentifier && event.actingDeviceIdentifier === ownDevice) return;
    if (isUnlockedPhase(sessionStore.getSnapshot().phase)) await syncVault().catch(() => undefined);
    else sessionStore.setConnectivity("stale");
  }

  private stopStream() {
    this.streamAbort?.abort();
    this.streamAbort = null;
  }

  private onSessionChange = () => {
    const phase = sessionStore.getSnapshot().phase;
    if (phase === this.observedPhase) return;
    this.observedPhase = phase;
    if (phase === "anonymous" || phase === "bootstrapping" || phase === "locked-offline" || phase === "unlocked-offline") {
      this.stopStream();
      return;
    }
    this.startStream();
  };

  private onBrowserOnline = () => void this.reconnect();
  private onBrowserOffline = () => {
    this.stopStream();
    sessionStore.setConnectivity("offline");
  };
}

export const connectivityController = new ConnectivityController();
