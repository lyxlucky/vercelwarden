"use client";

import { useState } from "react";
import { CloudDoneOutlined, CloudOffOutlined, DeleteOutlined, SyncOutlined } from "@mui/icons-material";
import { Alert, Button, Stack } from "@mui/material";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  const [confirmClear, setConfirmClear] = useState(false);
  const visible = session.phase !== "anonymous" && session.phase !== "bootstrapping";
  if (!visible) return null;

  async function synchronize() {
    setBusy(true);
    try { await connectivityController.syncNow(); } finally { setBusy(false); }
  }

  async function clearLocal() {
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
      setConfirmClear(false);
    }
  }

  const severity = session.connectivity === "online" ? "success" : session.connectivity === "syncing" ? "info" : "warning";
  return (
    <>
      <Alert
        severity={severity}
        icon={session.online ? <CloudDoneOutlined /> : <CloudOffOutlined />}
        role="status"
        aria-live="polite"
        action={(
          <Stack direction="row" spacing={1}>
            <Button color="inherit" size="small" startIcon={<SyncOutlined />} onClick={() => void synchronize()} disabled={busy || !session.online || session.readOnly}>
              同步
            </Button>
            <Button color="inherit" size="small" startIcon={<DeleteOutlined />} onClick={() => setConfirmClear(true)} disabled={busy}>
              清除本机数据
            </Button>
          </Stack>
        )}
        sx={{ borderRadius: 0 }}
      >
        {labels[session.connectivity]}
      </Alert>
      <ConfirmDialog
        open={confirmClear}
        title="清除本机数据"
        description="清除本机的离线快照、缓存和账户绑定。服务器数据不会被删除。"
        consequences="此操作会立即锁定当前会话；之后需要重新登录或重新建立离线快照。"
        confirmLabel="清除本机数据"
        busy={busy}
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearLocal}
      />
    </>
  );
}
