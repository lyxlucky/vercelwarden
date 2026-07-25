"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { AsyncState } from "@/components/ui/AsyncState";
import { AppLink } from "@/components/theme/AppLink";
import { AuthPanel, PasswordField } from "@/components/ui/AuthShell";
import { fetchServerConfig, registerAccount } from "@/features/auth/api";

type Values = {
  email: string;
  name: string;
  password: string;
  confirm: string;
  hint: string;
  invitationCode: string;
};

const initialValues: Values = { email: "", name: "", password: "", confirm: "", hint: "", invitationCode: "" };

export default function RegisterPage() {
  const router = useRouter();
  const confirmRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [policy, setPolicy] = useState<{ enabled: boolean; inviteRequired: boolean } | null>(null);
  const [values, setValues] = useState(initialValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmError, setConfirmError] = useState("");

  useEffect(() => {
    void fetchServerConfig()
      .then((config) => setPolicy(config.vercelwarden.registration))
      .catch(() => setError("无法读取当前实例的注册策略。"));
  }, []);

  useEffect(() => {
    if (error) requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);

  function update(key: keyof Values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "confirm" || key === "password") setConfirmError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.password !== values.confirm) {
      setConfirmError("两次输入的主密码不一致。");
      requestAnimationFrame(() => confirmRef.current?.focus());
      return;
    }
    setLoading(true);
    setError("");
    try {
      await registerAccount({
        email: values.email,
        name: values.name,
        password: values.password,
        passwordHint: values.hint,
        invitationCode: values.invitationCode,
      });
      router.replace("/login?registered=1");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号创建失败，请检查输入后重试。");
    } finally {
      setLoading(false);
    }
  }

  if (!policy && !error) {
    return (
      <AuthPanel eyebrow="创建安全空间" title="正在准备注册" description="正在读取当前实例的注册策略。">
        <AsyncState kind="loading" title="正在读取注册策略" />
      </AuthPanel>
    );
  }

  if (policy && !policy.enabled) {
    return (
      <AuthPanel
        eyebrow="注册不可用"
        title="当前实例未开放注册"
        description="管理员已关闭公开注册。已有账号仍可正常登录。"
        footer={<Button component={AppLink} href="/login" startIcon={<ArrowBackOutlined />} fullWidth sx={{ cursor: "pointer" }}>返回登录</Button>}
      >
        <AsyncState kind="forbidden" title="无法创建新账号" description="请联系实例管理员获取邀请或开通注册权限。" />
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      eyebrow="开始使用"
      title="创建账号"
      description="加密密钥在本设备生成，服务端只保存密文和登录验证哈希。"
      wide
      footer={(
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
          已有账号？{" "}<Button component={AppLink} href="/login" variant="text" size="small" sx={{ cursor: "pointer" }}>返回登录</Button>
        </Typography>
      )}
    >
      <Alert severity="info">
        请使用至少 12 位且只用于此密码库的主密码。忘记主密码后，服务端无法替你解密数据。
      </Alert>
      <Stack component="form" spacing={2.25} onSubmit={submit}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
          <TextField
            label="邮箱"
            type="email"
            autoComplete="username"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            required
            autoFocus
          />
          <TextField
            label="名称"
            autoComplete="name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            required
          />
        </Box>
        {policy?.inviteRequired ? (
          <TextField
            label="邀请码"
            value={values.invitationCode}
            onChange={(event) => update("invitationCode", event.target.value)}
            required
            helperText="邀请码由实例管理员提供"
          />
        ) : null}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
          <PasswordField
            label="主密码"
            autoComplete="new-password"
            spellCheck={false}
            value={values.password}
            onChange={(event) => update("password", event.target.value)}
            slotProps={{ htmlInput: { minLength: 12 } }}
            required
            helperText="至少 12 位；建议使用长短语"
          />
          <PasswordField
            inputRef={confirmRef}
            label="确认主密码"
            autoComplete="new-password"
            spellCheck={false}
            value={values.confirm}
            onChange={(event) => update("confirm", event.target.value)}
            required
            error={Boolean(confirmError)}
            helperText={confirmError || "再次输入以避免拼写错误"}
          />
        </Box>
        <TextField
          label="密码提示"
          value={values.hint}
          onChange={(event) => update("hint", event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
          helperText="可选。不要包含主密码本身或可推断主密码的信息。"
        />
        {error ? <Alert ref={errorRef} tabIndex={-1} severity="error" role="alert">{error}</Alert> : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
          <Button
            variant="contained"
            size="large"
            type="submit"
            disabled={loading || !policy?.enabled}
            startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <PersonAddAltOutlined />}
            sx={{ flex: 1, cursor: "pointer" }}
          >
            {loading ? "正在创建" : "创建账号"}
          </Button>
          <Button variant="text" size="large" onClick={() => router.push("/login")} disabled={loading} startIcon={<ArrowBackOutlined />} sx={{ cursor: "pointer" }}>
            取消
          </Button>
        </Stack>
      </Stack>
    </AuthPanel>
  );
}
