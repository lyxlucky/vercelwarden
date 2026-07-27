"use client";

import { useEffect, useId, useRef, useState } from "react";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";
import {
  Alert,
  Button,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { AppLink } from "@/components/theme/AppLink";
import { AuthPanel } from "@/components/ui/AuthShell";
import { MONO_FONT } from "@/components/theme/theme";

const providerLabels: Record<number, string> = { 0: "验证器", 3: "YubiKey", 7: "Passkey" };

export function TwoFactorChallenge({
  providers,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  providers: number[];
  loading: boolean;
  error?: string;
  onSubmit(provider: number, token: string): Promise<void>;
  onCancel(): void;
}) {
  const tabsId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState(providers[0] ?? 0);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (error) requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);

  const label = provider === 3 ? "YubiKey OTP" : provider === 7 ? "Passkey 响应" : "验证码";
  return (
    <AuthPanel
      eyebrow="额外验证"
      title="二步验证"
      description="选择已配置的验证方式，完成本次安全登录。"
      icon={<VerifiedUserOutlined aria-hidden="true" />}
      footer={(
        <Button component={AppLink} href="/recover-2fa" variant="text" fullWidth sx={{ cursor: "pointer" }}>
          无法使用验证设备？使用恢复码
        </Button>
      )}
    >
      <Tabs
        value={provider}
        onChange={(_, next: number) => {
          setProvider(next);
          setToken("");
        }}
        selectionFollowsFocus
        variant="fullWidth"
        aria-label="二步验证方式"
        sx={{
          minHeight: 44,
          border: 1,
          borderColor: "divider",
          borderRadius: 2.5,
          p: 0.5,
          "& .MuiTabs-indicator": { height: "100%", borderRadius: 2, zIndex: 0 },
          "& .MuiTab-root": { minHeight: 38, zIndex: 1, cursor: "pointer" },
          "& .Mui-selected": { color: "primary.contrastText !important" },
        }}
      >
        {providers.map((id) => (
          <Tab
            key={id}
            value={id}
            label={providerLabels[id] ?? `方式 ${id}`}
            id={`${tabsId}-${id}-tab`}
            aria-controls={`${tabsId}-${id}-panel`}
          />
        ))}
      </Tabs>

      <Stack
        component="form"
        spacing={2.25}
        role="tabpanel"
        id={`${tabsId}-${provider}-panel`}
        aria-labelledby={`${tabsId}-${provider}-tab`}
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(provider, token);
        }}
      >
        <TextField
          inputRef={inputRef}
          label={label}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          inputMode={provider === 0 ? "numeric" : "text"}
          autoComplete="one-time-code"
          required
          autoFocus
          slotProps={{ input: { sx: { fontFamily: MONO_FONT, letterSpacing: "0.3em", fontVariantNumeric: "tabular-nums" } } }}
          helperText={provider === 0 ? "输入验证器中显示的 6 位动态验证码" : provider === 3 ? "轻触 YubiKey 后输入一次性密码" : "按照浏览器提示完成 Passkey 验证"}
        />
        {error ? <Alert ref={errorRef} tabIndex={-1} severity="error" role="alert">{error}</Alert> : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
          <Button
            variant="contained"
            type="submit"
            disabled={loading || !token}
            startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <SecurityOutlined />}
            sx={{ flex: 1, cursor: "pointer" }}
          >
            {loading ? "正在验证" : "验证并继续"}
          </Button>
          <Button
            variant="text"
            type="button"
            startIcon={<ArrowBackOutlined />}
            onClick={onCancel}
            disabled={loading}
            sx={{ cursor: "pointer" }}
          >
            返回登录
          </Button>
        </Stack>
      </Stack>
    </AuthPanel>
  );
}
