"use client";

import { useState } from "react";
import { Cloud, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/primitives";
import { authSecretStore } from "@/features/auth/secret-store";
import { vaultStore } from "@/features/vault/store";
import { clearVercelwardenLocalData } from "@/lib/client/offline/vault-cache";
import { connectivityController } from "@/lib/client/state/connectivity";
import { sessionStore, useSession } from "@/lib/client/state/session-store";

const labels = {
  online: "已在线",
  syncing: "正在同步",
  degraded: "连接不稳定",
  offline: "离线只读",
  stale: "数据可能已过期",
  "reauth-required": "需要重新登录",
} as const;

export function NetworkStatus() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const visible = session.phase !== "anonymous" && session.phase !== "bootstrapping";
  if (!visible) return null;

  async function synchronize() {
    setBusy(true);
    try { await connectivityController.syncNow(); } finally { setBusy(false); }
  }

  async function clearLocal() {
    if (!window.confirm("清除本机的离线快照、缓存和账户绑定？服务器数据不会被删除。")) return;
    setBusy(true);
    try {
      await clearVercelwardenLocalData();
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("vercelwarden.")) localStorage.removeItem(key);
      }
      authSecretStore.clearDecryptionMaterial();
      vaultStore.clear();
      sessionStore.lock();
      window.location.replace("/lock");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={`network-status network-status--${session.connectivity}`} aria-live="polite">
      <span className="network-status__label">
        {session.online ? <Cloud size={15} aria-hidden="true" /> : <CloudOff size={15} aria-hidden="true" />}
        {labels[session.connectivity]}
      </span>
      <span className="network-status__actions">
        <Button variant="ghost" size="sm" onClick={() => void synchronize()} disabled={busy || !session.online || session.readOnly}>
          <RefreshCw size={14} aria-hidden="true" /> 同步
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void clearLocal()} disabled={busy}>
          <Trash2 size={14} aria-hidden="true" /> 清除本机数据
        </Button>
      </span>
    </aside>
  );
}
