"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import CloudOffOutlined from "@mui/icons-material/CloudOffOutlined";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import LockOpenOutlined from "@mui/icons-material/LockOpenOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import { Alert, Button, Chip, CircularProgress, Divider, Stack } from "@mui/material";
import { useRouter } from "next/navigation";
import { AuthPanel, PasswordField } from "@/components/ui/AuthShell";
import { unlockWithPasskey, unlockWithPassword } from "@/features/auth/api";
import { lockController } from "@/features/auth/lock-controller";
import { useSession } from "@/lib/client/state/session-store";

export default function LockPage() {
  const session = useSession();
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const offline = session.phase === "locked-offline";

  useEffect(() => {
    if (session.phase === "anonymous") router.replace("/login");
    if (session.phase === "unlocked") router.replace("/vault");
    if (session.phase === "unlocked-offline") window.location.replace("/vault");
  }, [router, session.phase]);

  useEffect(() => {
    if (error) requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await unlockWithPassword(password);
      if (!offline) router.replace("/vault");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法解锁密码库。");
    } finally {
      setPassword("");
      setLoading(false);
    }
  }

  async function passkeyUnlock() {
    setLoading(true);
    setError("");
    try {
      await unlockWithPasskey();
      router.replace("/vault");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法使用 Passkey 解锁密码库。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPanel
      eyebrow={offline ? "离线安全访问" : "会话已保护"}
      title="密码库已锁定"
      description="解锁只恢复当前设备上的访问权限，不会延长其他设备会话。"
      icon={<LockOutlined aria-hidden="true" />}
    >
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Chip label={session.user?.email ?? "当前账号"} variant="outlined" />
        <Chip
          label={offline ? "离线只读" : "在线会话"}
          color={offline ? "warning" : "success"}
          variant="outlined"
          icon={offline ? <CloudOffOutlined /> : undefined}
        />
      </Stack>
      {offline ? (
        <Alert severity="warning">
          当前网络不可用。解锁后只能查看本机缓存，所有更改操作会保持禁用，直到安全重新联网。
        </Alert>
      ) : null}
      <Stack component="form" spacing={2.25} onSubmit={unlock}>
        <PasswordField
          label="主密码"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoFocus
          helperText={offline ? "主密码将在本地验证，不会发送到网络" : "用于重新派生当前设备的解密密钥"}
        />
        {error ? <Alert ref={errorRef} tabIndex={-1} severity="error" role="alert">{error}</Alert> : null}
        <Button
          variant="contained"
          size="large"
          type="submit"
          disabled={loading || loggingOut || !password}
          startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <LockOpenOutlined />}
          sx={{ cursor: "pointer" }}
        >
          {loading ? "正在解锁" : offline ? "离线解锁" : "解锁密码库"}
        </Button>
      </Stack>
      {session.capabilities["auth.accountPasskey"] && !offline ? (
        <>
          <Divider>或</Divider>
          <Button
            variant="outlined"
            size="large"
            startIcon={<KeyOutlined />}
            disabled={loading || loggingOut}
            onClick={() => void passkeyUnlock()}
            sx={{ cursor: "pointer" }}
          >
            使用 Passkey 解锁
          </Button>
        </>
      ) : null}
      <Divider />
      <Button
        color="inherit"
        variant="text"
        startIcon={loggingOut ? <CircularProgress size={18} /> : <LogoutOutlined />}
        disabled={loading || loggingOut}
        onClick={() => {
          setLoggingOut(true);
          void lockController.logout().finally(() => setLoggingOut(false));
        }}
        sx={{ alignSelf: "center", cursor: "pointer" }}
      >
        {loggingOut ? "正在退出" : "退出账号并清除本机密钥"}
      </Button>
    </AuthPanel>
  );
}
