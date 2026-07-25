"use client";

import { useCallback, useEffect, useState } from "react";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import { Alert, Box, Button, Checkbox, FormControlLabel, List, ListItem, ListItemIcon, ListItemText, Stack, TextField, Typography } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { AsyncState } from "@/components/ui/AsyncState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { addYubiKey, beginTotpSetup, createAccountPasskey, createTwoFactorPasskey, deleteAccountPasskey, deleteTwoFactorPasskey, disableTwoFactor, finishTotpSetup, listAccountPasskeys, listTwoFactorCredentials, renameTwoFactorCredential, rotateRecoveryCodes, type AccountPasskeySummary, type TwoFactorCredential } from "@/features/security/api";
import { useSession } from "@/lib/client/state/session-store";

export default function SecuritySettingsPage() {
  const session = useSession();
  const [credentials, setCredentials] = useState<TwoFactorCredential[]>([]);
  const [credentialNames, setCredentialNames] = useState<Record<string, string>>({});
  const [passkeys, setPasskeys] = useState<AccountPasskeySummary[]>([]);
  const [password, setPassword] = useState("");
  const [totpKey, setTotpKey] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [totpName, setTotpName] = useState("Authenticator");
  const [yubikeyOtp, setYubikeyOtp] = useState("");
  const [twoFactorPasskeyName, setTwoFactorPasskeyName] = useState("安全密钥");
  const [passkeyName, setPasskeyName] = useState("我的 Passkey");
  const [directUnlock, setDirectUnlock] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [nextCredentials, nextPasskeys] = await Promise.all([listTwoFactorCredentials(), session.capabilities["auth.accountPasskey"] ? listAccountPasskeys() : Promise.resolve([])]);
    setCredentials(nextCredentials);
    setCredentialNames(Object.fromEntries(nextCredentials.map((credential) => [credential.id, credential.name])));
    setPasskeys(nextPasskeys);
  }, [session.capabilities]);

  useEffect(() => { const timer = window.setTimeout(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "无法加载安全凭据。")); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const run = async (action: () => Promise<unknown>, success: string, reload = true) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); if (reload) await load(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); }
    finally { setBusy(false); }
  };

  return (
    <RouteGuard requireOnline>
      <Stack component="main" id="main-content" spacing={3} sx={{ minWidth: 0 }}>
        <PageHeader title="安全凭据" description="管理二步验证、恢复码与账号 Passkey。所有变更均需要用途绑定的再次验证。" />
        {error ? <AsyncState kind="fatal" title="安全凭据操作失败" description={error} /> : null}
        {message ? <Alert severity="success" role="status">{message}</Alert> : null}
        <SectionCard title="再次验证"><TextField label="当前主密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></SectionCard>

        <SectionCard title="已配置的二步验证">
          {credentials.length ? <List disablePadding>{credentials.map((credential) => <ListItem key={credential.id} divider sx={{ px: 0, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "auto 1fr auto auto" }, gap: 1, alignItems: "center" }}><ListItemIcon sx={{ minWidth: 36 }}><SecurityOutlined color="primary" /></ListItemIcon><Box><TextField size="small" label={`${credential.name} 的名称`} value={credentialNames[credential.id] ?? credential.name} disabled={credential.id === "legacy-totp"} onChange={(event) => setCredentialNames({ ...credentialNames, [credential.id]: event.target.value })} /><Typography color="text.secondary" variant="caption">{credential.provider} · {credential.status}</Typography></Box><Button size="small" disabled={busy || !password || credential.id === "legacy-totp" || !credentialNames[credential.id]?.trim() || credentialNames[credential.id] === credential.name} onClick={() => void run(() => renameTwoFactorCredential(credential.id, credentialNames[credential.id], password), "验证方式名称已更新。")}>保存名称</Button><Button size="small" color="error" startIcon={<DeleteOutlineOutlined />} disabled={busy || !password} onClick={() => void run(() => credential.provider === "webauthn" ? deleteTwoFactorPasskey(credential.id, password) : disableTwoFactor(credential.type, password), "验证方式已禁用。")}>禁用</Button></ListItem>)}</List> : <AsyncState kind="empty" compact title="尚未配置二步验证" />}
        </SectionCard>

        <SectionCard title="验证器 (TOTP)">
          {!totpKey ? <Button startIcon={<AddOutlined />} disabled={busy || !password} onClick={() => void run(async () => { const setup = await beginTotpSetup(password); setTotpKey(setup.key); setTotpUri(setup.uri); }, "已生成待确认密钥。", false)}>开始设置</Button> : <Stack spacing={2}><TextField label="密钥" slotProps={{ htmlInput: { readOnly: true } }} value={totpKey} /><TextField label="OTP Auth URI" slotProps={{ htmlInput: { readOnly: true } }} value={totpUri} /><TextField label="名称" value={totpName} onChange={(event) => setTotpName(event.target.value)} /><TextField label="6 位验证码" inputMode="numeric" autoComplete="one-time-code" value={totpToken} onChange={(event) => setTotpToken(event.target.value)} /><Button variant="contained" disabled={busy || totpToken.length !== 6} onClick={() => void run(async () => { const result = await finishTotpSetup({ password, key: totpKey, token: totpToken, name: totpName }); setRecoveryCodes([result.recoveryCode]); setTotpKey(""); setTotpToken(""); }, "验证器已启用。")}>确认启用</Button></Stack>}
        </SectionCard>

        {session.capabilities["auth.yubikey"] ? <SectionCard title="YubiKey OTP"><Stack spacing={2}><TextField label="名称" value={totpName} onChange={(event) => setTotpName(event.target.value)} /><TextField label="触碰 YubiKey 生成 OTP" value={yubikeyOtp} onChange={(event) => setYubikeyOtp(event.target.value.trim())} /><Button disabled={busy || !password || yubikeyOtp.length !== 44} onClick={() => void run(async () => { await addYubiKey({ password, otp: yubikeyOtp, name: totpName }); setYubikeyOtp(""); }, "YubiKey 已添加。")}>添加 YubiKey</Button></Stack></SectionCard> : null}

        {session.capabilities["auth.twoFactorPasskey"] ? <SectionCard title="二步验证 Passkey" description="使用安全密钥、平台验证器或密码管理器作为登录后的第二步验证。"><Stack spacing={2}><TextField label="名称" value={twoFactorPasskeyName} onChange={(event) => setTwoFactorPasskeyName(event.target.value)} /><Button startIcon={<AddOutlined />} disabled={busy || !password || !twoFactorPasskeyName.trim()} onClick={() => void run(async () => { const result = await createTwoFactorPasskey({ password, name: twoFactorPasskeyName }); setRecoveryCodes([result.recoveryCode]); }, "二步验证 Passkey 已添加。")}>添加二步验证 Passkey</Button></Stack></SectionCard> : null}

        <SectionCard title="恢复码" description="新代码只显示一次，生成后旧代码立即失效。">
          <Stack spacing={2}>{recoveryCodes.length ? <Box component="pre" aria-label="恢复码" sx={{ m: 0, p: 2, borderRadius: 2, bgcolor: "action.hover", overflowX: "auto", userSelect: "all" }}>{recoveryCodes.join("\n")}</Box> : <Typography color="text.secondary">恢复码当前隐藏。</Typography>}<Button startIcon={<RefreshOutlined />} disabled={busy || !password} onClick={() => void run(async () => setRecoveryCodes((await rotateRecoveryCodes(password)).codes), "恢复码已轮换。", false)}>重新生成</Button></Stack>
        </SectionCard>

        <SectionCard title="账号 Passkey" action={<KeyOutlined color="primary" />}>
          {!session.capabilities["auth.accountPasskey"] ? <AsyncState kind="forbidden" compact title="当前实例未启用账号 Passkey" /> : <Stack spacing={2}><List disablePadding>{passkeys.map((passkey) => <ListItem key={passkey.id} divider sx={{ px: 0 }}><ListItemIcon><KeyOutlined /></ListItemIcon><ListItemText primary={passkey.name} secondary={passkey.directUnlock ? "登录 + 直接解锁" : "仅登录"} /><Button size="small" color="error" disabled={busy || !password} onClick={() => void run(() => deleteAccountPasskey(passkey.id, password), "Passkey 已删除。")}>删除</Button></ListItem>)}</List><TextField label="新 Passkey 名称" value={passkeyName} onChange={(event) => setPasskeyName(event.target.value)} />{session.capabilities["auth.passkeyDirectUnlock"] ? <FormControlLabel control={<Checkbox checked={directUnlock} onChange={(event) => setDirectUnlock(event.target.checked)} />} label="启用直接解锁（使用 WebAuthn PRF 派生包装密钥）" /> : null}<Button startIcon={<AddOutlined />} disabled={busy || !password || !passkeyName.trim()} onClick={() => void run(() => createAccountPasskey({ password, name: passkeyName, directUnlock }), directUnlock ? "直接解锁 Passkey 已添加。" : "Passkey 已添加。")}>添加 Passkey</Button></Stack>}
        </SectionCard>
      </Stack>
    </RouteGuard>
  );
}
