"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import { Alert, Button, CircularProgress, Stack, TextField } from "@mui/material";
import { useRouter } from "next/navigation";
import { AppLink } from "@/components/theme/AppLink";
import { AuthPanel, PasswordField } from "@/components/ui/AuthShell";
import { recoverTwoFactor } from "@/features/auth/api";

export default function RecoverTwoFactorPage() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (error) requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await recoverTwoFactor(email, password, code);
      router.replace("/login?recovered=1");
    } catch {
      setError("恢复信息无效、已经使用，或与当前账号不匹配。");
    } finally {
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <AuthPanel
      eyebrow="账号恢复"
      title="使用恢复码"
      description="当所有二步验证设备均不可用时，通过一次性恢复码重新获得访问权限。"
      icon={<RestartAltOutlined aria-hidden="true" />}
      footer={(
        <Button component={AppLink} href="/login" variant="text" startIcon={<ArrowBackOutlined />} fullWidth sx={{ cursor: "pointer" }}>
          返回登录
        </Button>
      )}
    >
      <Alert severity="warning" icon={<WarningAmberOutlined />}>
        恢复成功后将禁用二步验证并撤销所有现有设备会话。你需要重新登录并配置新的验证方式。
      </Alert>
      <Stack component="form" spacing={2.25} onSubmit={submit}>
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
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <TextField
          label="恢复码"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="one-time-code"
          required
          helperText="输入此前安全保存的一次性恢复码"
        />
        {error ? <Alert ref={errorRef} tabIndex={-1} severity="error" role="alert">{error}</Alert> : null}
        <Button
          color="error"
          variant="contained"
          size="large"
          type="submit"
          disabled={loading}
          startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <RestartAltOutlined />}
          sx={{ cursor: "pointer" }}
        >
          {loading ? "正在验证恢复信息" : "恢复账号并撤销会话"}
        </Button>
      </Stack>
    </AuthPanel>
  );
}
