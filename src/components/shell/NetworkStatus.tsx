"use client";

import { useState, type MouseEvent } from "react";
import {
  AccountCircleOutlined,
  CloudDoneOutlined,
  CloudOffOutlined,
  DeleteOutlined,
  SyncOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
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
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const visible = session.phase !== "anonymous" && session.phase !== "bootstrapping";
  if (!visible) return null;

  const label = labels[session.connectivity];
  const healthy = session.connectivity === "online";
  const statusColor = healthy ? "success.main" : session.connectivity === "syncing" ? "info.main" : "warning.main";
  const accountLabel = session.user?.name?.trim() || session.user?.email || "当前账号";

  function openMenu(event: MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function closeMenu() {
    setAnchorEl(null);
  }

  async function synchronize() {
    setBusy(true);
    try {
      await connectivityController.syncNow();
    } finally {
      setBusy(false);
    }
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

  return (
    <>
      <Tooltip title={`${accountLabel} · ${label}`}>
        <Button
          color="inherit"
          aria-label={`账号与同步状态：${label}`}
          aria-controls={anchorEl ? "account-status-menu" : undefined}
          aria-haspopup="menu"
          aria-expanded={anchorEl ? "true" : undefined}
          onClick={openMenu}
          sx={(theme) => ({
            minWidth: 0,
            maxWidth: 260,
            px: { xs: 0.75, lg: 1.25 },
            py: 0.5,
            borderRadius: 2,
            border: 1,
            borderColor: healthy ? "divider" : statusColor,
            textTransform: "none",
            cursor: "pointer",
            transition: theme.transitions.create(["background-color", "border-color", "color"], { duration: theme.transitions.duration.shorter }),
            "&:hover": { bgcolor: "action.hover", borderColor: statusColor },
          })}
        >
          <Box sx={{ position: "relative", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
            <AccountCircleOutlined />
            <Box
              component="span"
              sx={{
                position: "absolute",
                right: -2,
                bottom: -1,
                width: 9,
                height: 9,
                borderRadius: "50%",
                bgcolor: statusColor,
                border: 2,
                borderColor: "background.paper",
              }}
            />
          </Box>
          <Box sx={{ display: { xs: "none", lg: "block" }, ml: 1, minWidth: 0, textAlign: "left" }}>
            <Typography variant="body2" noWrap sx={{ maxWidth: 180, fontWeight: 650, lineHeight: 1.2 }}>
              {session.user?.email ?? accountLabel}
            </Typography>
            <Typography variant="caption" sx={{ color: statusColor, display: "block", lineHeight: 1.2 }}>
              {label}
            </Typography>
          </Box>
        </Button>
      </Tooltip>

      <Menu
        id="account-status-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        slotProps={{
          list: { "aria-label": "账号与本机数据" },
          paper: { sx: { mt: 1, minWidth: 292, maxWidth: "calc(100vw - 24px)", borderRadius: 2.5 } },
        }}
      >
        <Box sx={{ px: 2, py: 1.25, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>{accountLabel}</Typography>
          {session.user?.name ? <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{session.user.email}</Typography> : null}
          <Stack direction="row" sx={{ mt: 1, alignItems: "center", gap: 0.75 }} role="status" aria-live="polite">
            {session.online ? <CloudDoneOutlined sx={{ color: statusColor, fontSize: 18 }} /> : <CloudOffOutlined sx={{ color: statusColor, fontSize: 18 }} />}
            <Typography variant="body2" sx={{ color: statusColor, fontWeight: 650 }}>{label}</Typography>
            {session.readOnly ? <Typography variant="caption" color="text.secondary">· 只读</Typography> : null}
          </Stack>
        </Box>
        <Divider />
        <MenuItem
          disabled={busy || !session.online || session.readOnly}
          onClick={() => void synchronize()}
          sx={{ py: 1.25, cursor: "pointer" }}
        >
          <ListItemIcon>{busy ? <CircularProgress size={20} /> : <SyncOutlined fontSize="small" />}</ListItemIcon>
          <ListItemText primary={busy ? "正在同步" : "立即同步"} secondary="获取服务器上的最新密码库数据" />
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={busy}
          onClick={() => { closeMenu(); setConfirmClear(true); }}
          sx={{ py: 1.25, color: "error.main", cursor: "pointer", "& .MuiListItemIcon-root": { color: "inherit" } }}
        >
          <ListItemIcon><DeleteOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary="清除本机数据" secondary="不会删除服务器上的数据" slotProps={{ secondary: { color: "text.secondary" } }} />
        </MenuItem>
      </Menu>

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
