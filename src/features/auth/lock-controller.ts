"use client";

import { sessionStore } from "@/lib/client/state/session-store";
import { authSecretStore } from "@/features/auth/secret-store";
import { revokeSession } from "@/features/auth/api";
import { vaultStore } from "@/features/vault/store";
import { vaultCache } from "@/lib/client/offline/vault-cache";

const CHANNEL_NAME = "vercelwarden-auth";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

type LockMessage = { type: "lock" | "logout"; source: string };

class LockController {
  private channel: BroadcastChannel | null = null;
  private timer: number | null = null;
  private deadline = 0;
  private readonly source = crypto.randomUUID();
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    if ("BroadcastChannel" in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.addEventListener("message", this.onMessage);
    }
    window.addEventListener("pointerdown", this.onActivity, { passive: true });
    window.addEventListener("keydown", this.onActivity);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.resetDeadline();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.clearTimer();
    window.removeEventListener("pointerdown", this.onActivity);
    window.removeEventListener("keydown", this.onActivity);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.channel?.removeEventListener("message", this.onMessage);
    this.channel?.close();
    this.channel = null;
  }

  lock = (broadcast = true) => {
    authSecretStore.clearDecryptionMaterial();
    vaultStore.clear();
    const phase = sessionStore.getSnapshot().phase;
    sessionStore.lock();
    this.clearTimer();
    if (broadcast) this.channel?.postMessage({ type: "lock", source: this.source } satisfies LockMessage);
    if (phase !== "anonymous" && window.location.pathname !== "/lock") window.location.replace("/lock");
  };

  logout = async (broadcast = true) => {
    const userId = sessionStore.getSnapshot().user?.id;
    authSecretStore.clearDecryptionMaterial();
    vaultStore.clear();
    if (broadcast) await revokeSession().catch(() => undefined);
    sessionStore.logout();
    if (userId) {
      await vaultCache.deleteAccount(window.location.origin, userId).catch(() => undefined);
      localStorage.removeItem("vercelwarden.offline-snapshot-ready");
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(`vercelwarden.account.${userId}.`)) localStorage.removeItem(key);
      }
    }
    if (broadcast) this.channel?.postMessage({ type: "logout", source: this.source } satisfies LockMessage);
    if (window.location.pathname !== "/login") window.location.replace("/login");
  };

  private timeoutMs() {
    const configured = Number(localStorage.getItem("vercelwarden.lock-timeout-ms"));
    return Number.isFinite(configured) && configured >= 60_000 ? configured : DEFAULT_TIMEOUT_MS;
  }

  private resetDeadline() {
    if (sessionStore.getSnapshot().phase !== "unlocked") return;
    this.deadline = Date.now() + this.timeoutMs();
    this.clearTimer();
    this.timer = window.setTimeout(() => this.onDeadline(), Math.min(this.timeoutMs(), 2_147_483_647));
  }

  private clearTimer() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private onDeadline() {
    if (Date.now() < this.deadline) {
      this.resetDeadline();
      return;
    }
    const action = localStorage.getItem("vercelwarden.timeout-action");
    if (action === "logout") void this.logout();
    else this.lock();
  }

  private onActivity = () => this.resetDeadline();

  private onVisibilityChange = () => {
    if (document.visibilityState !== "visible") return;
    if (this.deadline && Date.now() >= this.deadline) this.onDeadline();
    else this.resetDeadline();
  };

  private onMessage = (event: MessageEvent<LockMessage>) => {
    if (!event.data || event.data.source === this.source) return;
    if (event.data.type === "lock") this.lock(false);
    if (event.data.type === "logout") void this.logout(false);
  };
}

export const lockController = new LockController();
