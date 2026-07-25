"use client";

import { useEffect, useState } from "react";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { lockController } from "@/features/auth/lock-controller";
import { changeKdf, changeMasterPassword, fetchAccountProfile, revealApiKey, updateAccountProfile, type AccountProfile } from "@/features/security/api";

export default function AccountSettingsPage() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [name, setName] = useState("");
  const [hint, setHint] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [kdfType, setKdfType] = useState(1);
  const [kdfIterations, setKdfIterations] = useState(3);
  const [kdfMemory, setKdfMemory] = useState(64);
  const [kdfParallelism, setKdfParallelism] = useState(4);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchAccountProfile().then((value) => { setProfile(value); setName(value.name); setHint(value.masterPasswordHint ?? ""); }).catch((reason) => setError(String(reason)));
  }, []);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RouteGuard requireOnline>
      <Stack component="main" id="main-content" spacing={3} sx={{ minWidth: 0 }}>
        <PageHeader title="账号设置" description={profile?.email ?? "正在加载账号…"} />
        {error ? <AsyncState kind="fatal" title="账号操作失败" description={error} /> : null}
        {message ? <Alert severity="success" role="status">{message}</Alert> : null}
        {!profile && !error ? <AsyncState kind="loading" description="正在加载账号资料。" /> : null}

        <SectionCard title="资料与密码提示" description="修改资料需要用途绑定的主密码验证。">
          <Stack spacing={2.25}>
            <TextField label="显示名称" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField label="密码提示" value={hint} onChange={(event) => setHint(event.target.value)} />
            <TextField label="当前主密码" helperText="只用于本次敏感操作。" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <Button startIcon={<SaveOutlined />} disabled={busy || !profile || !password} variant="contained" onClick={() => void run(async () => { const updated = await updateAccountProfile({ name, hint: hint || null, password }); setProfile(updated); }, "账号资料已更新。")}>保存资料</Button>
          </Stack>
        </SectionCard>

        <SectionCard title="修改主密码" description="修改后会退出当前会话，需使用新主密码重新登录。" danger>
          <Stack spacing={2.25}>
            <TextField label="新主密码" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <TextField label="确认新主密码" type="password" autoComplete="new-password" error={Boolean(confirmPassword && newPassword !== confirmPassword)} helperText={confirmPassword && newPassword !== confirmPassword ? "两次输入不一致。" : "至少 8 个字符。"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            <Button color="error" variant="contained" disabled={busy || !password || newPassword.length < 8 || newPassword !== confirmPassword} onClick={() => void run(async () => { await changeMasterPassword({ currentPassword: password, newPassword }); await lockController.logout(); }, "主密码已修改，请重新登录。")}>修改主密码</Button>
          </Stack>
        </SectionCard>

        <SectionCard title="KDF 安全参数" description="更强参数会增加解锁耗时；更新后需重新登录。">
          <Stack spacing={2.25}>
            <FormControl><InputLabel id="kdf-type-label">算法</InputLabel><Select labelId="kdf-type-label" label="算法" value={kdfType} onChange={(event) => { const value = Number(event.target.value); setKdfType(value); setKdfIterations(value === 1 ? 3 : 600000); }}><MenuItem value={1}>Argon2id</MenuItem><MenuItem value={0}>PBKDF2-SHA256</MenuItem></Select></FormControl>
            <TextField label="迭代次数" type="number" slotProps={{ htmlInput: { min: kdfType === 1 ? 1 : 100000 } }} value={kdfIterations} onChange={(event) => setKdfIterations(Number(event.target.value))} />
            {kdfType === 1 ? <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}><TextField label="内存 (MiB)" type="number" slotProps={{ htmlInput: { min: 16, max: 1024 } }} value={kdfMemory} onChange={(event) => setKdfMemory(Number(event.target.value))} /><TextField label="并行度" type="number" slotProps={{ htmlInput: { min: 1, max: 16 } }} value={kdfParallelism} onChange={(event) => setKdfParallelism(Number(event.target.value))} /></Box> : null}
            <Button disabled={busy || !password} onClick={() => void run(async () => { await changeKdf({ password, type: kdfType, iterations: kdfIterations, memory: kdfType === 1 ? kdfMemory : null, parallelism: kdfType === 1 ? kdfParallelism : null }); await lockController.logout(); }, "KDF 已更新，请重新登录。")}>更新 KDF</Button>
          </Stack>
        </SectionCard>

        <SectionCard title="账号 API key" description="仅在再次验证后显示；轮换后旧 key 立即失效。" action={<KeyOutlined color="primary" />}>
          <Stack spacing={2}>
            {apiKey ? <Box component="code" aria-label="账号 API key" sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover", overflowWrap: "anywhere", userSelect: "all", fontFamily: "monospace" }}>{apiKey}</Box> : <Typography color="text.secondary">API key 当前隐藏。</Typography>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button disabled={busy || !password} onClick={() => void run(async () => setApiKey((await revealApiKey(password)).apiKey), "API key 已显示。")}>显示</Button>
              <Button disabled={busy || !password} color="error" onClick={() => void run(async () => setApiKey((await revealApiKey(password, true)).apiKey), "API key 已轮换。")}>轮换</Button>
            </Stack>
          </Stack>
        </SectionCard>
      </Stack>
    </RouteGuard>
  );
}
