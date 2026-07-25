"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import LoginOutlined from "@mui/icons-material/LoginOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { AppLink } from "@/components/theme/AppLink";
import { AuthPanel, PasswordField } from "@/components/ui/AuthShell";
import { TwoFactorChallenge } from "@/features/auth/TwoFactorChallenge";
import {
  cancelPreparedLogin,
  fetchServerConfig,
  loginWithPasskey,
  preparePasswordLogin,
  submitPasswordLogin,
  TwoFactorRequiredError,
  type PreparedPasswordLogin,
} from "@/features/auth/api";
import { sessionStore } from "@/lib/client/state/session-store";

export default function LoginPage() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [prepared, setPrepared] = useState<PreparedPasswordLogin | null>(null);
  const [providers, setProviders] = useState<number[]>([]);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextNotice = params.get("registered") === "1"
      ? "账号已创建，请使用新的凭据登录。"
      : params.get("recovered") === "1"
        ? "二步验证已恢复，请重新登录所有设备。"
        : "";
    if (nextNotice) queueMicrotask(() => setNotice(nextNotice));
    void fetchServerConfig()
      .then((config) => setPasskeyEnabled(config.vercelwarden.capabilities["auth.accountPasskey"]))
      .catch(() => setPasskeyEnabled(false));
  }, []);

  useEffect(() => () => cancelPreparedLogin(prepared), [prepared]);

  useEffect(() => {
    if (error) requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    let nextPrepared: PreparedPasswordLogin | null = null;
    try {
      nextPrepared = await preparePasswordLogin(email, password);
      setPassword("");
      await submitPasswordLogin(nextPrepared);
      router.replace("/vault");
    } catch (caught) {
      if (caught instanceof TwoFactorRequiredError) {
        setPrepared(caught.prepared);
        setProviders(caught.providers);
      } else {
        cancelPreparedLogin(nextPrepared);
        setError(caught instanceof Error ? caught.message : "登录失败，请重试。");
      }
    } finally {
      setLoading(false);
    }
  }

  if (prepared && providers.length > 0) {
    return (
      <TwoFactorChallenge
        providers={providers}
        loading={loading}
        error={error}
        onCancel={() => {
          cancelPreparedLogin(prepared);
          setPrepared(null);
          setProviders([]);
          setError("");
        }}
        onSubmit={async (provider, token) => {
          setLoading(true);
          setError("");
          try {
            await submitPasswordLogin(prepared, { provider, token });
            router.replace("/vault");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "验证失败，请重试。");
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }

  return (
    <AuthPanel
      eyebrow="欢迎回来"
      title="登录密码库"
      description="登录后解锁你的加密密码库。主密码不会离开当前设备。"
      footer={(
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
          还没有账号？{" "}
          <Button component={AppLink} href="/register" variant="text" size="small" sx={{ cursor: "pointer" }}>
            创建账号
          </Button>
        </Typography>
      )}
    >
      <Stack component="form" spacing={2.25} onSubmit={signIn}>
        {notice ? <Alert severity="success" role="alert" onClose={() => setNotice("")}>{notice}</Alert> : null}
        <TextField
          label="邮箱"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
        <PasswordField
          label="主密码"
          autoComplete="current-password"
          spellCheck={false}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          helperText="仅用于在本设备派生解密密钥"
        />
        {error ? (
          <Alert ref={errorRef} tabIndex={-1} severity="error" role="alert">
            {error}
          </Alert>
        ) : null}
        <Button
          variant="contained"
          size="large"
          type="submit"
          disabled={loading}
          startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <LoginOutlined />}
          sx={{ cursor: "pointer" }}
        >
          {loading ? "正在登录" : "登录"}
        </Button>
      </Stack>

      {passkeyEnabled ? (
        <>
          <Divider><Typography variant="caption" color="text.secondary">或使用无密码方式</Typography></Divider>
          <Button
            variant="outlined"
            size="large"
            startIcon={loading ? <CircularProgress size={18} /> : <KeyOutlined />}
            onClick={async () => {
              setLoading(true);
              setError("");
              try {
                await loginWithPasskey();
                router.replace(sessionStore.getSnapshot().phase === "unlocked" ? "/vault" : "/lock");
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Passkey 登录未完成。");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            sx={{ cursor: "pointer" }}
          >
            使用 Passkey 登录
          </Button>
        </>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
          <KeyOutlined fontSize="small" aria-hidden="true" />
          <Typography variant="caption">此实例当前未启用 Passkey 登录</Typography>
        </Box>
      )}
    </AuthPanel>
  );
}
